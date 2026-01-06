---
name: release
description: >-
  Create and publish releases for the LogTape project.
  Use when releasing a new version, creating a patch release, or creating
  a major/minor release. Handles CHANGES.md updates, version bumping, tagging,
  and branch management.
---

Release skill
=============

This skill automates the release process for the LogTape project.  There are
two types of releases: patch releases and major/minor releases.


Prerequisites
-------------

Before starting any release:

1.  Verify the remote repository name:

    ~~~~ bash
    git remote -v
    ~~~~

    Use the correct remote name (usually `origin` or `upstream`) in all push
    commands.

2.  Ensure you're on the correct branch and it's up to date.

3.  Run tests to ensure everything passes:

    ~~~~ bash
    deno task test
    deno task check
    ~~~~


Patch releases
--------------

Patch releases (e.g., 1.2.3) are for bug fixes and small improvements.
They are created from `X.Y-maintenance` branches.

### Step 1: Prepare the release

1.  Check out the maintenance branch:

    ~~~~ bash
    git checkout 1.2-maintenance
    git pull
    ~~~~

2.  Update *CHANGES.md*: Find the section for the version being released and
    change "To be released." to "Released on {Month} {Day}, {Year}." using
    the current date in English.  For example:

    ~~~~ markdown
    Version 1.2.3
    -------------

    Released on January 5, 2026.
    ~~~~

3.  Commit the changes:

    ~~~~ bash
    git add CHANGES.md
    git commit -m "Release 1.2.3"
    ~~~~

4.  Create the tag (without `v` prefix).  Always use `-m` to provide a tag
    message to avoid opening an editor for GPG-signed tags:

    ~~~~ bash
    git tag -m "LogTape 1.2.3" 1.2.3
    ~~~~

### Step 2: Prepare next version

1.  Add a new section at the top of *CHANGES.md* for the next patch version:

    ~~~~ markdown
    Version 1.2.4
    -------------

    To be released.


    Version 1.2.3
    -------------

    Released on January 5, 2026.
    ~~~~

2.  Bump the version using the version sync script:

    ~~~~ bash
    deno task update-versions 1.2.4
    ~~~~

3.  Commit the version bump:

    ~~~~ bash
    git add -A
    git commit -m "Version bump

    [ci skip]"
    ~~~~

### Step 3: Push

Push the tag and branch to the remote:

~~~~ bash
git push origin 1.2.3 1.2-maintenance
~~~~

### Step 4: Cascade merges

After creating a patch release, you must merge it forward to newer maintenance
branches and eventually to `main`.

1.  Check if a newer maintenance branch exists (e.g., `1.3-maintenance`):

    ~~~~ bash
    git branch -a | grep maintenance
    ~~~~

2.  If a newer maintenance branch exists:

    a.  Check out the newer branch and merge the tag:

        ~~~~ bash
        git checkout 1.3-maintenance
        git merge 1.2.3
        ~~~~

    b.  Resolve any conflicts (commonly in *CHANGES.md*, *deno.json*, and
        *package.json* files).

    c.  **Copy changelog entries**: After resolving conflicts, copy the
        changelog entries from the merged tag's version into the current
        branch's unreleased version section.  The entries should be:

         -  Grouped by package (e.g., `### @logtape/logtape`, `### @logtape/file`)
         -  Inserted *above* any existing entries in each package section
         -  Issue/PR reference definitions (e.g., `[#123]: ...`) should not
            be duplicated if they already exist

        For example, if merging 1.2.3 into 1.3-maintenance where 1.3.2 is
        pending:

        *Before* (1.3-maintenance):

        ~~~~ markdown
        Version 1.3.2
        -------------

        To be released.

        ### @logtape/file

         -  Added new logging features.  [[#125]]

        [#125]: https://github.com/dahlia/logtape/issues/125
        ~~~~

        *Merged tag 1.2.3 contains*:

        ~~~~ markdown
        Version 1.2.3
        -------------

        Released on January 6, 2026.

        ### @logtape/file

         -  Fixed a crash on startup.  [[#123]]

        [#123]: https://github.com/dahlia/logtape/issues/123
        ~~~~

        *After* (1.3-maintenance):

        ~~~~ markdown
        Version 1.3.2
        -------------

        To be released.

        ### @logtape/file

         -  Fixed a crash on startup.  [[#123]]
         -  Added new logging features.  [[#125]]

        [#123]: https://github.com/dahlia/logtape/issues/123
        [#125]: https://github.com/dahlia/logtape/issues/125
        ~~~~

    d.  Run tests to verify:

        ~~~~ bash
        deno task test
        deno task check
        ~~~~

    e.  Complete the merge commit (use default message).

    f.  Create a new patch release for this branch by repeating Steps 1-3
        for version 1.3.x (e.g., 1.3.1).

    g.  Continue cascading to even newer maintenance branches if they exist.

3.  If no newer maintenance branch exists, merge to `main`:

    ~~~~ bash
    git checkout main
    git merge 1.2.3  # or the last tag you created (e.g., 1.3.1)
    ~~~~

    Resolve conflicts, run tests, and push:

    ~~~~ bash
    deno task test
    deno task check
    git push origin main
    ~~~~


Major/minor releases
--------------------

Major/minor releases (e.g., 1.3.0, 2.0.0) introduce new features or breaking
changes.  They are always created from the `main` branch with patch version 0.

### Step 1: Prepare the release on main

1.  Check out and update main:

    ~~~~ bash
    git checkout main
    git pull
    ~~~~

2.  Update *CHANGES.md*: Find the section for the version being released and
    change "To be released." to "Released on {Month} {Day}, {Year}." using
    the current date in English.  For example:

    ~~~~ markdown
    Version 1.3.0
    -------------

    Released on January 5, 2026.
    ~~~~

3.  Commit the changes:

    ~~~~ bash
    git add CHANGES.md
    git commit -m "Release 1.3.0"
    ~~~~

4.  Create the tag (without `v` prefix).  Always use `-m` to provide a tag
    message to avoid opening an editor for GPG-signed tags:

    ~~~~ bash
    git tag -m "LogTape 1.3.0" 1.3.0
    ~~~~

### Step 2: Prepare next version on main

1.  Add a new section at the top of *CHANGES.md* for the next minor version:

    ~~~~ markdown
    Version 1.4.0
    -------------

    To be released.


    Version 1.3.0
    -------------

    Released on January 5, 2026.
    ~~~~

2.  Bump the version using the version sync script:

    ~~~~ bash
    deno task update-versions 1.4.0
    ~~~~

3.  Commit the version bump:

    ~~~~ bash
    git add -A
    git commit -m "Version bump

    [ci skip]"
    ~~~~

### Step 3: Push main and tag

~~~~ bash
git push origin 1.3.0 main
~~~~

### Step 4: Create maintenance branch

1.  Create the maintenance branch from the release tag:

    ~~~~ bash
    git branch 1.3-maintenance 1.3.0
    ~~~~

2.  Check out the maintenance branch:

    ~~~~ bash
    git checkout 1.3-maintenance
    ~~~~

3.  Add a section for the first patch version in *CHANGES.md*:

    ~~~~ markdown
    Version 1.3.1
    -------------

    To be released.


    Version 1.3.0
    -------------

    Released on January 5, 2026.
    ~~~~

4.  Bump the version using the version sync script:

    ~~~~ bash
    deno task update-versions 1.3.1
    ~~~~

5.  Commit the version bump:

    ~~~~ bash
    git add -A
    git commit -m "Version bump

    [ci skip]"
    ~~~~

6.  Push the maintenance branch:

    ~~~~ bash
    git push origin 1.3-maintenance
    ~~~~


Version format reference
------------------------

 -  Patch releases: `X.Y.Z` where Z > 0 (e.g., 1.2.3, 1.2.4)
 -  Minor releases: `X.Y.0` (e.g., 1.3.0, 1.4.0)
 -  Major releases: `X.0.0` (e.g., 2.0.0, 3.0.0)
 -  Maintenance branches: `X.Y-maintenance` (e.g., 1.2-maintenance)
 -  Tags: No `v` prefix (e.g., `1.2.3`, not `v1.2.3`)
 -  Tag messages: `LogTape X.Y.Z` format (use `-m` flag to avoid editor)


CHANGES.md format
-----------------

Each version section follows this format:

~~~~ markdown
Version X.Y.Z
-------------

Released on {Month} {Day}, {Year}.

### @logtape/logtape

 -  Change description.  [[#123]]

[#123]: https://github.com/dahlia/logtape/issues/123

### @logtape/file

 -  Change description.
~~~~

For unreleased versions:

~~~~ markdown
Version X.Y.Z
-------------

To be released.
~~~~


Checklist summary
-----------------

### Patch release checklist

- [ ] Check out `X.Y-maintenance` branch
- [ ] Update *CHANGES.md* release date
- [ ] Commit with message "Release X.Y.Z"
- [ ] Create tag `X.Y.Z` with `-m "LogTape X.Y.Z"`
- [ ] Add next version section to *CHANGES.md*
- [ ] Run `deno task update-versions X.Y.(Z+1)`
- [ ] Commit with message "Version bump\n\n[ci skip]"
- [ ] Push tag and branch
- [ ] Cascade merge to newer maintenance branches (if any):
  - [ ] Merge tag into newer branch
  - [ ] Copy changelog entries to unreleased version (above existing entries)
  - [ ] Run tests and complete merge commit
  - [ ] Create patch release for that branch
- [ ] Merge to `main` (if no newer maintenance branches)

### Major/minor release checklist

- [ ] Check out `main` branch
- [ ] Update *CHANGES.md* release date
- [ ] Commit with message "Release X.Y.0"
- [ ] Create tag `X.Y.0` with `-m "LogTape X.Y.0"`
- [ ] Add next version section to *CHANGES.md*
- [ ] Run `deno task update-versions X.(Y+1).0`
- [ ] Commit with message "Version bump\n\n[ci skip]"
- [ ] Push tag and `main` branch
- [ ] Create `X.Y-maintenance` branch from tag
- [ ] Check out maintenance branch
- [ ] Add patch version section to *CHANGES.md*
- [ ] Run `deno task update-versions X.Y.1`
- [ ] Commit with message "Version bump\n\n[ci skip]"
- [ ] Push maintenance branch
