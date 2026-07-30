---
name: sacho
description: >-
  Help a maintainer adopt and operate Sacho, the opinionated changelog manager
  that keeps user-facing release notes as one small Markdown fragment per change
  under changes.d/ and compiles them into CHANGES.md at release time. Use this
  skill whenever a repository has a sacho.toml, a changes.d/ directory, or a
  CHANGES.md built from fragments; whenever the user wants to add Sacho to a
  project, write or edit a changelog entry for a change they just made, cut a
  release, publish release notes, or wire `sacho check` into CI or a pre-commit
  hook; whenever forward-porting a bugfix release across maintenance branches or
  resolving a changelog merge conflict; and whenever `sacho check` or the
  changelog merge driver reports a problem. Also use it any time the user
  mentions Sacho, changes.d fragments, or asks how to write a changelog entry
  for users instead of generating one from commit messages.
metadata:
  type: reference
---

Managing changelogs with Sacho
==============================

Sacho keeps a project's release notes as one small Markdown file per change,
called a fragment, under `changes.d/`. At release time it sorts and compiles the
fragments into a dated section of `CHANGES.md`, then deletes the consumed
fragments. It works in any repository regardless of language, ships as a single
static binary, and does not even assume Git.

The single most important thing to hold onto: Sacho never generates entries from
commit messages, and neither should you. A commit message explains to
collaborators why a change was made; a changelog entry tells users what changed
and what to do when they upgrade. Those are different documents for different
readers. When you draft an entry, do not transform a diff or a `git log` line
into prose. Read the change, work out its effect on someone who only sees the
public surface, and write that. When a change has no user-visible effect, the
honest entry is no entry.


Delegate the details to the live docs
-------------------------------------

The commands and flags below are a working map, not the source of truth. For the
exact syntax of the version installed in this repository, trust `sacho --help`
and `sacho <command> --help` over anything written here or online, because the
docs track the latest release while a project may pin an older binary. Use the
Markdown documentation for concepts, workflow, and reasoning; reach for `--help`
before you depend on a specific flag or output format.

 -  `https://sacho.dev/llms.txt` lists every page.
    `https://sacho.dev/llms-full.txt` is the whole documentation in one file
    when you want to read broadly.
 -  Every page has a `.md` twin. Fetch these directly:
     -  `https://sacho.dev/why-sacho.md` and `https://sacho.dev/philosophy.md`
        for the reasoning, worth reading before you write entries for a project.
     -  `https://sacho.dev/guide/getting-started.md` to adopt Sacho.
     -  `https://sacho.dev/guide/everyday-workflow.md` for the per-change loop.
     -  `https://sacho.dev/guide/releases.md` for cutting releases and
        forward-porting.
     -  `https://sacho.dev/guide/ci-and-hooks.md` for coverage enforcement.
     -  `https://sacho.dev/guide/version-control.md` for merge drivers and
        presets.
     -  `https://sacho.dev/guide/package-monorepos.md` for deriving sections
        from regular package layouts.
     -  `https://sacho.dev/concepts/fragments.md`,
        `https://sacho.dev/concepts/changelog-lifecycle.md`, and
        `https://sacho.dev/concepts/sections.md` for the model.
     -  `https://sacho.dev/reference/commands.md` and
        `https://sacho.dev/reference/configuration.md` for exhaustive
        references.
     -  `https://sacho.dev/reference/section-patterns.md` for the capture
        grammar and precedence rules.
     -  `https://sacho.dev/troubleshooting.md` when something misbehaves.


Orient yourself before acting
-----------------------------

Check what the repository already has. Is there a `sacho.toml` at the root, a
`changes.d/` directory, a `CHANGES.md`? Is `sacho` on the `PATH`
(`sacho --version`)? A repository with `sacho.toml` is already set up, so skip
adoption and go to the workflow that fits the request. A repository without it
needs `sacho init` first, but only after confirming the maintainer wants to
adopt Sacho rather than asking about it.

If the binary is missing, the recommended install is
`mise use -g github:dahlia/sacho`; `npm install -g @sacho/sacho` and
`cargo install sacho` work too. Read `getting-started.md` for the full list.


Adopting Sacho in a project
---------------------------

Run `sacho init` from the repository root. It creates `sacho.toml`,
`changes.d/`, and `CHANGES.md`, and in a Git repository registers the merge
drivers. Interactive setup infers issue-link templates from the remote and can
install commit hooks. When an existing changelog is present, it also offers
level-three headings found across the changelog as section candidates and
suggests directories and source path globs. When multiple selected headings
map to one unambiguous sibling package directory, it can store them as one
section pattern. `sacho init --interactive` forces the questions and
`--no-interactive` suppresses them.

Leave old released sections exactly as they are. If the current `Unreleased` or
`Version X` region contains entries, run `sacho import-unreleased` before
creating fragments. Inspect and confirm its normalization diff; in a
noninteractive workflow, review the diff from the refused run before using
`--force`. The command creates deterministic *imported-unreleased.md* fragments
and infers the next version from `Version X`. If there are no current entries,
skip the import and set the version with `sacho next 1.2.0`.

Two configuration decisions matter early, both covered in
`reference/configuration.md`: whether to enforce fragment coverage
(`[check].paths`), and, for a monorepo, whether to define explicit
`[[sections]]` or one `[[section-patterns]]` family so each package's changes
require a fragment in that package's section.


Writing a fragment for a change
-------------------------------

The everyday loop is four commands. Create the fragment, write it, format, and
check:

~~~~ sh
sacho add clear-function      # add --section <id> <name> in a sectioned repo
sacho fmt
sacho preview
sacho check
~~~~

`sacho add` creates `changes.d/<name>.md` holding an empty list item and prints
the path. Name the file after the change itself (`clear-function`), never after
an issue or PR number. Topic names make the right follow-up natural: when a
later commit reworks the same feature, you edit the existing fragment instead of
adding a second one that documents a state users never saw.

Keep the fragment in the same commit series as the implementation. Stored in the
repository, it travels with the change through merges, rebases, cherry-picks,
and reverts for free. That coupling is the whole point of fragments, so never
park changelog text in an issue, a wiki, or a draft release note.


Writing entries users can actually read
---------------------------------------

This is the part no tool can do for the maintainer, and where you earn your
keep. Fetch `philosophy.md` when you want the full argument; the working rules:

Address the person upgrading, in the vocabulary of the public surface. A
refactor that touches forty files but changes nothing users can observe is a
real commit and a nonexistent entry. A one-line dependency bump that closes a
vulnerability is a trivial commit and a critical entry.

Write one entry per user-visible change. If a release adds `remove_all()` and a
later commit in the same cycle renames it to `clear()`, the released changelog
contains a single line, `Added clear() function`, not the two-step history. Edit
the existing fragment; never narrate intermediate states that never shipped.

Be concise, and keep internal names out. Private type names, module paths, and
subsystem nicknames tell the reader this document is not for them. If a
mechanism must be mentioned, describe what it does rather than naming a thing
the reader cannot look up.

Start each entry with a past-tense verb: Added, Changed, Deprecated, Fixed,
Removed, Security. Sacho sorts by the entry text, so these verbs fall into the
familiar Keep a Changelog order without any category metadata.

Reference issues and PRs with shortcut links in trailing brackets, house style,
at the end of the first paragraph: `[[#842], [#848]]`. Attribution is inline
prose in the same bracket: `[[#857] by Lee Hoyeon]`. The compiler resolves the
numbers into link definitions using the templates in `[links]`, and `check`
fails on a reference no template can resolve.

Because Sacho asks a human to write, present your drafts to the maintainer for
approval rather than committing prose in their voice unreviewed. You are helping
them write for their users, not automating the writing away.


The fragment file format
------------------------

A fragment is a UTF-8 Markdown file whose body is exactly one top-level
unordered list, with optional YAML frontmatter. Nothing else at the top level:
no headings, no stray paragraphs, no second list. Inside a list item any block
content is fine, including nested lists and fenced code. One item is usual;
related changes from one pull request can share a fragment as several items.

~~~~ markdown
---
priority: -10
---

 -  Added `clear()` to remove every entry at once.  The function accepts an
    optional predicate to remove entries selectively.  [[#842], [#848]]
~~~~

`priority` (integer, default `0`) is the only frontmatter key; lower sorts
earlier, and most fragments need no frontmatter at all. See
`concepts/fragments.md` for the exact constraints.


Cutting a release
-----------------

Read the compiled result as a user would before you freeze it:

~~~~ sh
sacho next 1.2.0
sacho preview
sacho check
~~~~

In the preview, merge entries that describe the same change, drop development
history, and confirm each entry names public behavior. Then compile:

~~~~ sh
sacho release --next 1.3.0            # reads the version from changes.d/next
sacho release 1.2.0 --next 1.3.0      # or state the version explicitly
sacho release 1.2.0 --date 2026-07-19 --next 1.3.0   # when the date must be fixed
~~~~

`release` stamps the dated section, deletes the consumed fragments, and sets the
next version. The first release may proceed without fragments when the changelog
has no released version sections. Later releases refuse to proceed when the
fragments compile to nothing unless `--allow-empty` is passed. Empty list items
and HTML comments are scaffolding, not release notes, and scaffold-only
fragments require the explicit option even on the first release. Commit the
changed `CHANGES.md`, the removed fragments, and the updated `changes.d/next`
together.


Publishing release notes
------------------------

After the release commit, `sacho show` prints one frozen section:

~~~~ sh
sacho show 1.2.0
sacho show 1.2.0 --skip-heading --no-word-wrap --output-file release-notes.md
~~~~

A tag-triggered GitHub Actions job can hand that file to the GitHub CLI:

~~~~ sh
version="${GITHUB_REF_NAME#v}"
sacho show "$version" --skip-heading --no-word-wrap --output-file release-notes.md
gh release create "$GITHUB_REF_NAME" --notes-file release-notes.md
~~~~

`show` reads only released sections; it never compiles current fragments.


Enforcing coverage in CI and hooks
----------------------------------

Configure the paths whose changes require a fragment, then let a machine catch
the omissions reviewers miss:

~~~~ toml
[check]
paths = ["src/**", "packages/**"]
~~~~

Locally, `sacho check --staged` inspects the Git index;
`sacho init --install-hook` installs a pre-commit hook chain. In CI, check a
branch commit-by-commit against its base:

~~~~ sh
sacho check --base origin/main
~~~~

Make sure the checkout history includes the base revision; a shallow clone that
omits it cannot support the comparison. A commit that genuinely needs no entry
opts out with a `Changelog: none` trailer in its message (or the
`[skip changelog]` family of substrings). The exemption applies only to the
commit that carries it. Details in `guide/ci-and-hooks.md`.


Forward-porting a bugfix release across maintenance branches
------------------------------------------------------------

The scenario: a fix lands on `1.1-maintenance`, `1.1.5` ships, and the fix needs
to reach `1.2-maintenance` and `main`. Two paths, and which one you are on
decides the work.

Merge before releasing, and there is nothing to do. If you merge
`1.1-maintenance` into `1.2-maintenance` while the fix's fragment still exists,
the VCS carries the fragment along, and each branch later consumes its own copy.
Prefer this ordering when you can; it needs no Sacho command.

Merge the release tag, and the fragment arrives already consumed. The incoming
`1.1.5` release commit deleted the fragment, so the merge brings only the frozen
`1.1.5` section. The merge driver inserts that section at its version position
in `CHANGES.md`, keeps the receiving branch's `changes.d/next`, and prints a
`sacho carry` hint on stderr. Now it is policy, not mechanics: if the receiving
branch's own next release should also list the fix, run `sacho carry 1.1.5` to
decompile that section back into `carried-from-1.1.5.md` fragments, edit them
if this branch presents the change differently, and treat them as ordinary
unreleased entries. If the imported `1.1.5` section is enough, do nothing.

`carry` is idempotent by design: it always writes the same
`carried-from-<version>.md` name and overwrites any file already there. That is
safe on a fresh carry, but if you have already edited those carried fragments,
re-running `carry` discards your edits, so check for existing
`carried-from-*.md` files before repeating it.

Under Jujutsu there is no per-path merge driver, so after resolving a concurrent
fragment merge run `sacho sync --force` and inspect the result.
`guide/releases.md` and `guide/version-control.md` cover both.


When something goes wrong
-------------------------

`sacho check` reports across three layers: fragment validity and formatting,
agreement between the materialized unreleased region and the fragments, and
fragment coverage for changed paths.

A formatting or drift failure is mechanically repairable. `sacho check --fix`
runs `fmt` and re-syncs the generated region; it will not write prose. If
`CHANGES.md` was hand-edited, remember that fragments are the source of truth:
move the edited text into a fragment, then `sacho sync`. Sacho asks before
discarding hand edits, and `sacho sync --force` skips that prompt, so read the
diff first.

A missing-fragment failure names the affected section and suggests `sacho add`.
Either write the entry or, if the commit truly has no user-visible effect, use
the `Changelog: none` exemption. For anything stranger, fetch
`troubleshooting.md`.
