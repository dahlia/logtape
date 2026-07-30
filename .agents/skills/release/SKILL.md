---
name: release
description: >-
  Create and publish releases for the LogTape project. Use when releasing a
  new version, creating a patch release, or creating a major/minor release.
  Handles Sacho changelog compilation, version bumping, tagging, and branch
  management.
---

Release skill
=============

LogTape uses Sacho to keep unreleased changelog entries in *changes.d/* and
compile them into *CHANGES.md*.  Never edit the materialized unreleased region
of *CHANGES.md* by hand.  Edit the fragments and let Sacho update the
changelog.

There are two types of releases: patch releases from `X.Y-maintenance`
branches, and major/minor releases from `main`.  The [Sacho release guide]
describes the underlying changelog lifecycle.

[Sacho release guide]: https://sacho.dev/guide/releases


Prerequisites
-------------

Before starting any release:

1.  Read and follow *AI\_POLICY.md*.  Every AI-assisted commit must include an
    `Assisted-by: AGENT_NAME:MODEL_VERSION` trailer.

2.  Verify the branch, worktree, and remote:

    ~~~~ bash
    git status --short --branch
    git remote -v
    ~~~~

    All GitHub operations must target *dahlia/logtape*.  Use the actual remote
    name in commands below; do not assume it is `origin`.

3.  Ensure the branch is up to date and that the release version in
    *changes.d/next.txt* matches the package versions.  If the next version has
    not been prepared yet, set both through the repository task and commit that
    change before releasing:

    ~~~~ bash
    mise run bump-version 1.2.3
    ~~~~

    Do not call `sacho next` and `mise run update-versions` separately.  The
    task keeps the Sacho next-version file and package versions together.

4.  Review the release notes as a user would, then run the full test suite:

    ~~~~ bash
    sacho preview
    sacho check
    mise run test
    ~~~~

    Edit the source fragments to combine duplicate entries, remove development
    history, and describe public behavior.  Run `sacho fmt` after editing a
    fragment and repeat the preview and checks.


Patch releases
--------------

Patch releases such as 1.2.3 are created from the matching
`X.Y-maintenance` branch.

### Prepare the release

1.  Check out and update the maintenance branch:

    ~~~~ bash
    git checkout 1.2-maintenance
    git pull
    ~~~~

2.  Complete the prerequisite review and checks above.

3.  Compile the fragments into the released changelog section:

    ~~~~ bash
    sacho release 1.2.3
    mise run fmt
    ~~~~

    `sacho release` dates the new *CHANGES.md* section, removes the consumed
    fragments, and removes *changes.d/next.txt*.  Review all three parts of the
    diff.  Do not replace this command with a manual edit to *CHANGES.md*.

4.  Run `mise run check`, then commit the changelog, deleted fragments, and
    deleted next-version file together.  Use `Release 1.2.3` as the subject
    and include the AI disclosure trailer when applicable.

5.  Create the tag without a `v` prefix.  Always pass `-m` so a signed tag does
    not open an editor:

    ~~~~ bash
    git tag -m "LogTape 1.2.3" 1.2.3
    ~~~~

### Start the next patch cycle

Use the repository task to create the next Sacho region and update every
package version:

~~~~ bash
mise run bump-version 1.2.4
sacho check
mise run check
~~~~

Review and commit *changes.d/next.txt*, the materialized *CHANGES.md* region,
and all package version changes together.  Use `Version bump` as the subject,
retain the existing `[ci skip]` body, and include the AI disclosure trailer
when applicable.

Push the tag and maintenance branch to the verified remote:

~~~~ bash
git push origin 1.2.3 1.2-maintenance
~~~~

Replace `origin` with the remote name found during the prerequisite check.


Forward-porting patch releases
------------------------------

Forward-port a patch release through newer maintenance branches and finally to
`main`.

When possible, merge the maintenance branch before releasing it.  The
unconsumed fragments then travel with the code and require no Sacho-specific
work.

When merging an already released tag, the release commit contains a frozen
changelog section but no fragments.  The Sacho merge driver places the frozen
section in *CHANGES.md* and preserves the receiving branch's
*changes.d/next.txt*.

### Newer maintenance branches

1.  Check out the newer branch and merge the released tag:

    ~~~~ bash
    git checkout 1.3-maintenance
    git merge 1.2.3
    ~~~~

2.  If this branch's next release should repeat the patch notes, first check
    that no edited *carried-from-1.2.3.md* fragment already exists, then run:

    ~~~~ bash
    sacho carry 1.2.3
    ~~~~

    `sacho carry` recreates package-scoped fragments from the frozen section.
    Edit them if the later branch exposes different behavior.  Re-running the
    command overwrites existing carried fragments.

3.  Resolve code conflicts.  Do not copy entries into *CHANGES.md* by hand.
    Fix fragments instead, then run:

    ~~~~ bash
    sacho fmt
    sacho preview
    sacho check
    mise run test
    ~~~~

4.  Complete the merge and release the newer branch's patch version.  Continue
    through each newer maintenance branch.

### Main branch

Merge the last released tag into `main`, resolve conflicts, and run the same
checks.  Do *not* run `sacho carry` for this merge: LogTape does not duplicate
patch-release notes in the next major/minor release.


Major and minor releases
------------------------

Major and minor releases such as 1.3.0 and 2.0.0 are created from `main` with
patch version 0.

### Release from main

1.  Check out and update `main`, then complete the prerequisite review and
    checks.

2.  Compile, format, and review the release:

    ~~~~ bash
    sacho release 1.3.0
    mise run fmt
    mise run check
    ~~~~

3.  Commit the release changes with subject `Release 1.3.0`, including the AI
    disclosure trailer when applicable, then create the tag:

    ~~~~ bash
    git tag -m "LogTape 1.3.0" 1.3.0
    ~~~~

4.  Start the next minor cycle on `main`:

    ~~~~ bash
    mise run bump-version 1.4.0
    sacho check
    mise run check
    ~~~~

    Commit the next-version file, materialized changelog region, and package
    version changes together as the version bump.

5.  Push `main` and the release tag to the verified remote:

    ~~~~ bash
    git push origin 1.3.0 main
    ~~~~

### Create the maintenance branch

Create the maintenance branch from the release tag, not from the version-bump
commit on `main`:

~~~~ bash
git branch 1.3-maintenance 1.3.0
git checkout 1.3-maintenance
mise run bump-version 1.3.1
sacho check
mise run check
~~~~

Commit the first patch cycle's next-version file, materialized changelog region,
and package version changes together, then push the branch:

~~~~ bash
git push origin 1.3-maintenance
~~~~


Publishing release notes
------------------------

When release notes must be published manually, render only the frozen release
section:

~~~~ bash
sacho show 1.3.0 --skip-heading --no-word-wrap \
  --output-file release-notes.md
~~~~

`sacho show` never compiles current fragments.  Use the generated file as the
release notes, then remove it if it is only a temporary publishing artifact.


Version format reference
------------------------

 -  Patch releases: `X.Y.Z` where Z > 0, such as 1.2.3
 -  Minor releases: `X.Y.0`, such as 1.3.0
 -  Major releases: `X.0.0`, such as 2.0.0
 -  Maintenance branches: `X.Y-maintenance`, such as `1.2-maintenance`
 -  Tags: no `v` prefix, such as `1.2.3`
 -  Tag messages: `LogTape X.Y.Z`
