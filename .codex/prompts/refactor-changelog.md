The files in the changelog folder have all been created for each release in github.

You have access to the github cli tool `gh`.

Go through all changelog's where in the meta has `reviewed: false`.

Look up the corresponding tag/commit using the gh cli tool, and work out all the commits that were in that release.

go through those commits and add them to the changelog file to read like a public exposed, informative changelog. if something doesn't make sense you can do a git diff to see what that commit actually did.

rewrite each changelog where `reviewed: false` to contain a good detailed changelog information.

ensure your new reviewed file updated the reviewed meta to `reviewed: true`

ensure every changelog file has a headline title. the title should be the biggest, most impactful feature/fix/item that we have changed.

order the information in terms of impact with the biggest, more impactful items being to the top, with the smallest, least likely people care about to the. bottom.

try and keep your new changelog consisten with the other ones.

DO NOT TOUCH a changelog where the `reviewed: true` is set. Only touch the false.

Be consistent with the other changelogs. For examplel, do not put a level 1 heading in. It's not in any of the other ones.
