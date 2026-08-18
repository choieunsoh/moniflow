import { confirm, select } from '@inquirer/prompts';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import simpleGit from 'simple-git';

export type VersionType = 'patch' | 'minor' | 'major';

type ReleaseOptions = {
  versionTypeArg?: VersionType;
  fix: boolean;
};

type CommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | ['ignore', 'pipe', 'pipe'];
};

type QualityGate = {
  name: string;
  args: string[];
  errorMessage: string;
};

type ChangelogSection = 'Added' | 'Fixed' | 'Other';

const CHANGELOG_SECTIONS: ChangelogSection[] = ['Added', 'Fixed', 'Other'];

type ParsedCommit = {
  section: ChangelogSection;
  text: string;
};

type PackageInfo = {
  name: string;
  version: string;
  private: boolean;
  registry: string | undefined;
};

// This template lives at scripts/release.ts, so the repo root is one level up.
// If you place it elsewhere (e.g. scripts/release/release.ts), add another '..'.
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const changelogPath = resolve(rootDir, 'CHANGELOG.md');
const packageJsonPath = resolve(rootDir, 'package.json');
const prettierCliPath = resolve(rootDir, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

export const DEFAULT_CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

// Verification-only gates, run in order. Prune this to match the npm scripts the
// project actually defines — a gate that runs a missing script fails the release.
export const QUALITY_GATES: QualityGate[] = [
  { name: 'typecheck', args: ['run', 'typecheck'], errorMessage: 'Typecheck failed' },
  { name: 'lint', args: ['run', 'lint'], errorMessage: 'Lint failed' },
  { name: 'format:check', args: ['run', 'format:check'], errorMessage: 'Format check failed' },
  { name: 'test', args: ['test'], errorMessage: 'Tests failed' },
  // build:web (next build → static out/), not build (tsc --noEmit — already covered by typecheck).
  { name: 'build:web', args: ['run', 'build:web'], errorMessage: 'Build failed' },
];

// Mutating auto-fixes, run only when the release is invoked with --fix.
export const AUTO_FIX_STEPS: QualityGate[] = [
  { name: 'lint:fix', args: ['run', 'lint:fix'], errorMessage: 'Lint auto-fix failed' },
  { name: 'format', args: ['run', 'format'], errorMessage: 'Format auto-fix failed' },
];

function isVersionType(value: string): value is VersionType {
  return value === 'patch' || value === 'minor' || value === 'major';
}

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function writeLine(fd: 1 | 2, ...args: unknown[]): void {
  writeSync(fd, `${formatArgs(args)}\n`);
}

function log(...args: unknown[]): void {
  writeLine(1, ...args);
}

function warn(...args: unknown[]): void {
  writeLine(2, ...args);
}

function error(...args: unknown[]): void {
  writeLine(2, ...args);
}

function runCommand(command: string, args: string[], options: CommandOptions = {}): string {
  const output = execFileSync(command, args, {
    cwd: options.cwd ?? rootDir,
    env: { ...process.env, ...options.env },
    encoding: 'utf-8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });

  return typeof output === 'string' ? output.trim() : '';
}

// Prefer the npm binary that launched this script (respects nvm / the active
// Node), falling back to PATH resolution when run outside an npm lifecycle.
function resolveNpmRunner(): { command: string; args: string[] } {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath] };
  }

  return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: [] };
}

function runNpm(args: string[], options: CommandOptions = {}): string {
  const runner = resolveNpmRunner();
  return runCommand(runner.command, [...runner.args, ...args], options);
}

function readPackageJson(): PackageInfo {
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('package.json did not parse to an object');
  }

  const version =
    'version' in parsed && typeof parsed.version === 'string' ? parsed.version : undefined;
  if (version === undefined) {
    throw new Error('package.json is missing a string "version" field');
  }

  const name = 'name' in parsed && typeof parsed.name === 'string' ? parsed.name : 'the package';
  const isPrivate = 'private' in parsed && parsed.private === true;

  let registry: string | undefined;
  if (
    'publishConfig' in parsed &&
    typeof parsed.publishConfig === 'object' &&
    parsed.publishConfig !== null
  ) {
    const publishConfig = parsed.publishConfig;
    if ('registry' in publishConfig && typeof publishConfig.registry === 'string') {
      registry = publishConfig.registry;
    }
  }

  return { name, version, private: isPrivate, registry };
}

function readChangelog(): string {
  try {
    return readFileSync(changelogPath, 'utf-8');
  } catch {
    return '';
  }
}

export function parseConventionalCommit(message: string): ParsedCommit | null {
  const match = message.match(
    /^(feat|fix|chore|docs|refactor|build|test)(?:\([^)]+\))?!?:\s*(.+)$/,
  );
  if (!match) {
    return null;
  }

  const [, type, text] = match;

  // Release bookkeeping commits are noise in the changelog, not changelog-worthy.
  if (type === 'chore' && /^release v/.test(text)) {
    return null;
  }

  if (type === 'feat') {
    return { section: 'Added', text };
  }

  if (type === 'fix') {
    return { section: 'Fixed', text };
  }

  return { section: 'Other', text };
}

// Insert the newest entry directly BELOW the "# Changelog" header and ABOVE older
// entries. A naive `newEntry + oldFile` concatenation would bury the header at the
// bottom of the file after the second release — this keeps the document well-formed.
export function insertChangelogEntry(existingChangelog: string, entry: string): string {
  const trimmedExisting = existingChangelog.trim();
  const trimmedEntry = entry.trim();

  if (!trimmedExisting) {
    return `${DEFAULT_CHANGELOG_HEADER}\n${trimmedEntry}\n`;
  }

  const firstVersionHeadingIndex = existingChangelog.search(/^## \[/m);
  if (firstVersionHeadingIndex === -1) {
    return `${existingChangelog.trimEnd()}\n\n${trimmedEntry}\n`;
  }

  const beforeEntries = existingChangelog.slice(0, firstVersionHeadingIndex).trimEnd();
  const remainingEntries = existingChangelog.slice(firstVersionHeadingIndex).trimStart();
  return `${beforeEntries}\n\n${trimmedEntry}\n\n${remainingEntries}`.trimEnd() + '\n';
}

function buildChangelogEntry(version: string, commits: string[]): string {
  const sections: Record<ChangelogSection, string[]> = { Added: [], Fixed: [], Other: [] };

  for (const message of commits) {
    const parsed = parseConventionalCommit(message);
    if (parsed) {
      sections[parsed.section].push(parsed.text);
    }
  }

  // Local date, not UTC — an evening release in a UTC+ timezone would otherwise
  // stamp the previous calendar day.
  const date = new Intl.DateTimeFormat('en-CA').format(new Date());
  let changelogEntry = `## [${version}] - ${date}\n\n`;

  for (const section of CHANGELOG_SECTIONS) {
    const items = sections[section];
    if (items.length > 0) {
      changelogEntry += `### ${section}\n\n`;
      for (const item of items) {
        changelogEntry += `- ${item}\n`;
      }
      changelogEntry += '\n';
    }
  }

  return changelogEntry.trimEnd();
}

export function parseReleaseArgs(args: string[]): ReleaseOptions {
  const options: ReleaseOptions = { fix: false };

  for (const arg of args) {
    if (arg === '--fix') {
      options.fix = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (isVersionType(arg)) {
      if (options.versionTypeArg) {
        throw new Error(`Multiple version types provided: ${options.versionTypeArg} and ${arg}`);
      }
      options.versionTypeArg = arg;
      continue;
    }

    throw new Error(`Unknown release argument: ${arg}`);
  }

  return options;
}

export function runQualityGates(options: { fix?: boolean } = {}): void {
  log('\n▶ Running quality gates...');

  if (options.fix) {
    log('▶ Applying requested auto-fixes...');
    for (const step of AUTO_FIX_STEPS) {
      try {
        runNpm(step.args, { stdio: 'inherit' });
      } catch (cause) {
        error(`❌ ${step.errorMessage}`);
        throw new Error(step.errorMessage, { cause });
      }
    }
  }

  for (const gate of QUALITY_GATES) {
    try {
      runNpm(gate.args, { stdio: 'inherit' });
    } catch (cause) {
      error(`❌ ${gate.errorMessage}`);
      throw new Error(gate.errorMessage, { cause });
    }
  }

  log('✓ All quality gates passed');
}

export async function determineVersionType(arg?: string): Promise<VersionType> {
  if (arg && isVersionType(arg)) {
    return arg;
  }

  const currentVersion = getCurrentVersion();
  return select<VersionType>({
    message: `Current version: ${currentVersion}. Select version bump type:`,
    choices: [
      {
        name: `patch (${currentVersion} → ${semver.inc(currentVersion, 'patch')}) - Bug fixes`,
        value: 'patch',
      },
      {
        name: `minor (${currentVersion} → ${semver.inc(currentVersion, 'minor')}) - New features`,
        value: 'minor',
      },
      {
        name: `major (${currentVersion} → ${semver.inc(currentVersion, 'major')}) - Breaking changes`,
        value: 'major',
      },
    ],
  });
}

function getCurrentVersion(): string {
  return readPackageJson().version;
}

export function bumpVersion(type: VersionType): string {
  log(`\n▶ Bumping ${type} version...`);
  // `npm version` keeps package-lock.json in sync and preserves file formatting.
  runNpm(['version', type, '--no-git-tag-version'], { stdio: 'inherit' });
  const newVersion = getCurrentVersion();
  log(`✓ Bumped to ${newVersion}`);
  return newVersion;
}

export async function generateChangelog(version: string): Promise<void> {
  log('\n▶ Generating changelog...');

  const git = simpleGit(rootDir);

  let lastTag: string | undefined;
  try {
    const tags = await git.tags();
    lastTag = tags.latest || undefined;
    if (!lastTag) {
      log('No tags found, using all commits');
    }
  } catch {
    lastTag = undefined;
  }

  const gitLog = lastTag ? await git.log({ from: lastTag, to: 'HEAD' }) : await git.log();
  if (gitLog.total === 0) {
    warn('No commits since last release');
    return;
  }

  const changelogEntry = buildChangelogEntry(
    version,
    gitLog.all.map((commit) => commit.message),
  );

  const nextChangelog = insertChangelogEntry(readChangelog(), changelogEntry);
  writeFileSync(changelogPath, nextChangelog);
  runCommand(process.execPath, [prettierCliPath, '--write', changelogPath], { stdio: 'inherit' });
  log(`✓ Generated changelog (${gitLog.total} commits)`);
}

export async function commitRelease(
  version: string,
  options: { includeAllChanges?: boolean } = {},
): Promise<void> {
  log('\n▶ Committing release...');

  const git = simpleGit(rootDir);
  if (options.includeAllChanges) {
    // Safe because main() aborts unless the tree started clean — the only changes
    // present are the auto-fixes this run just made.
    await git.add(['-A']);
  } else {
    await git.add(['package.json', 'package-lock.json']);
    if (readChangelog().trim()) {
      await git.add('CHANGELOG.md');
    }
  }

  await git.commit(`chore: release v${version}\n\nBump version and update changelog`);
  log(`✓ Committed release v${version}`);
}

export async function createAndPushTag(version: string): Promise<void> {
  log('\n▶ Creating and pushing tag...');

  const git = simpleGit(rootDir);
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('Working directory not clean. Commit or stash changes first.');
  }

  const currentBranch = status.current;
  if (currentBranch !== 'main') {
    throw new Error(`Not on main branch (currently on ${currentBranch})`);
  }

  await git.addTag(`v${version}`);
  log(`✓ Created tag v${version}`);

  await git.push('origin', 'main');
  await git.pushTags('origin');
  log('✓ Pushed to remote');
}

export function createGitHubRelease(version: string): void {
  log('\n▶ Creating GitHub release...');

  let releaseNotes = `Release v${version}`;
  const changelog = readChangelog();
  const versionSection = changelog.match(
    new RegExp(`## \\[${version}\\]([\\s\\S]*?)(?=## \\[|$)`, 'm'),
  );
  if (versionSection?.[1]) {
    releaseNotes = `## [${version}]${versionSection[1].trim()}`;
  }

  try {
    runCommand(
      'gh',
      ['release', 'create', `v${version}`, '--title', `v${version}`, '--notes', releaseNotes],
      {
        stdio: 'inherit',
      },
    );
  } catch (cause) {
    throw new Error(
      'Failed to create GitHub release. Ensure gh CLI is installed and authenticated.',
      { cause },
    );
  }

  log(`✓ Created GitHub release v${version}`);
}

export function publishToNpm(pkg: PackageInfo): void {
  log('\n▶ Publishing package...');

  const isGitHubPackages = (pkg.registry ?? '').includes('npm.pkg.github.com');
  if (isGitHubPackages) {
    // GitHub Packages authenticates npm via GITHUB_TOKEN; keep the release token
    // separate from any ambient GITHUB_TOKEN so CI/local don't clobber each other.
    if (!process.env.GITHUB_TOKEN_WRITE_PACKAGE) {
      throw new Error(
        'GITHUB_TOKEN_WRITE_PACKAGE not set. Create a token with write:packages at https://github.com/settings/tokens',
      );
    }
    process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN_WRITE_PACKAGE;
  }

  try {
    runNpm(['publish'], { stdio: 'inherit' });
  } catch (cause) {
    throw new Error(`Failed to publish ${pkg.name}@${pkg.version}`, { cause });
  }

  log(`✓ Published ${pkg.name}@${pkg.version}`);
}

// The Vercel org this repo is linked to, from `.vercel/project.json` (written by `vercel link`).
// It has to be passed as --scope on every deploy: `vercel whoami` answers with the personal account
// while the project lives under a team, so the bare command fails with a flat "Not authorized" that
// names neither the problem nor the fix. Reading the linked file beats hardcoding a slug — a re-link
// to another org keeps working with no edit here.
// Returns null when the repo isn't linked yet (a fresh clone), which the caller treats as "skip the
// deploy", not as a failed release.
export function parseVercelScope(projectJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(projectJson);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('orgId' in parsed) || typeof parsed.orgId !== 'string') return null;
    return parsed.orgId;
  } catch {
    return null;
  }
}

export function vercelDeployArgs(scope: string): string[] {
  return ['vercel', 'deploy', '--prod', '--yes', '--scope', scope];
}

// A missing or unreadable link file is the same answer as an unusable one: not linked.
function readLinkedVercelScope(): string | null {
  try {
    return parseVercelScope(readFileSync(resolve(rootDir, '.vercel/project.json'), 'utf-8'));
  } catch {
    return null;
  }
}

// Ship the tagged version to production. Runs LAST, after the tag and GitHub release are pushed, so
// the git side of a release is never left half-done by a deploy problem — and so the tree Vercel
// uploads is the bumped one. (The CLI uploads the working tree and rebuilds remotely; the local
// out/ that the build:web gate produced before the bump never reaches production.)
export function deployToVercel(version: string): void {
  log('\n▶ Deploying to production...');

  const scope = readLinkedVercelScope();
  if (scope === null) {
    warn('⚠ Skipped deploy: this repo is not linked to a Vercel project.');
    warn('  Run `vercel link` once, then deploy with `npx vercel --prod`.');
    return;
  }

  const args = vercelDeployArgs(scope);
  try {
    runCommand('npx', args, { stdio: 'inherit' });
  } catch (cause) {
    // A non-zero exit here is NOT proof the deploy failed — the CLI has been seen taking a SIGTERM
    // (exit 143) mid-build while the deployment went on to finish READY. So this reports rather than
    // throws: v${version} is already tagged and released, and turning a possibly-successful deploy
    // into a failed release would send someone re-running an irreversible npm publish.
    error(`\n⚠ Deploy did not report success. v${version} is tagged and released either way.`);
    error('  A non-zero exit is not proof of failure — check the real state before retrying:');
    error(`    npx vercel inspect <deployment-url> --scope ${scope}`);
    error(`  Retry with:\n    npx ${args.join(' ')}`);
    if (cause instanceof Error && cause.message) error(`  CLI said: ${cause.message}`);
    return;
  }

  log(`✓ Deployed v${version} to production`);
}

export function showInstallInstructions(pkg: PackageInfo): void {
  const registry = pkg.registry ?? 'https://registry.npmjs.org';
  const isGitHubPackages = registry.includes('npm.pkg.github.com');
  const scope = pkg.name.startsWith('@') ? pkg.name.slice(0, pkg.name.indexOf('/')) : undefined;

  log('\n' + '='.repeat(60));
  log('📦 Installation Instructions');
  log('='.repeat(60));
  log(`\nInstall ${pkg.name}@${pkg.version} globally:\n`);
  log(`  npm install -g ${pkg.name}`);
  if (isGitHubPackages && scope) {
    log(`\nNote: Make sure ~/.npmrc has:\n`);
    log(`  ${scope}:registry=https://npm.pkg.github.com`);
    log('  //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN_WRITE_PACKAGE}');
  }
  log('\n' + '='.repeat(60));
}

async function main(): Promise<void> {
  const pkg = readPackageJson();
  log(`🚀 ${pkg.name} Release Automation`);

  const git = simpleGit(rootDir);
  const status = await git.status();
  if (!status.isClean()) {
    error('\n❌ Working directory has uncommitted changes:');
    error(`   Modified:  ${status.modified.length} files`);
    error(`   Added:     ${status.created.length} files`);
    error(`   Deleted:   ${status.deleted.length} files`);
    error(`   Untracked: ${status.not_added.length} files`);
    if (status.staged.length > 0) {
      error(`   Staged:    ${status.staged.length} files`);
    }
    error('\nPlease commit or stash changes before running release.');
    error('Aborting release.\n');
    process.exit(1);
  }

  const options = parseReleaseArgs(process.argv.slice(2));
  runQualityGates({ fix: options.fix });

  const versionType = await determineVersionType(options.versionTypeArg);
  log(`✓ Version type: ${versionType}`);

  if (!options.versionTypeArg) {
    const previewVersion = semver.inc(pkg.version, versionType);
    const proceed = await confirm({ message: `Release v${previewVersion}?`, default: true });
    if (!proceed) {
      log('Release cancelled');
      process.exit(0);
    }
  }

  const newVersion = bumpVersion(versionType);
  await generateChangelog(newVersion);
  await commitRelease(newVersion, { includeAllChanges: options.fix });
  // Push the tagged commit to the remote BEFORE the irreversible npm publish, so a
  // failed push never leaves an orphaned published version with no matching git tag.
  await createAndPushTag(newVersion);

  if (!pkg.private) {
    const published: PackageInfo = { ...pkg, version: newVersion };
    publishToNpm(published);
    createGitHubRelease(newVersion);
    showInstallInstructions(published);
  } else {
    // Private/app projects: a release is a tagged commit + GitHub release, no publish.
    createGitHubRelease(newVersion);
  }

  log(`\n✅ Released v${newVersion}`);

  // Deploy last, so a release is never left with a pushed tag but no attempt to ship it — and so
  // everything irreversible has already succeeded before we touch production.
  deployToVercel(newVersion);
}

const currentModulePath = fileURLToPath(import.meta.url);
const currentScriptPath = process.argv[1] ? resolve(process.argv[1]) : '';

if (currentScriptPath && currentModulePath === currentScriptPath) {
  main().catch((err) => {
    if (err instanceof Error) {
      error('\n❌ Release failed:', err.message);
    } else {
      error('\n❌ Release failed:', err);
    }
    process.exit(1);
  });
}
