go through all changelog's where in the meta has `reviewed: false`.

go through the false files and refactor them to read like a public exposed, informative changelog. if something doesn't make sense you can do a git diff to see what that commit actually did.

rewrite each changelog where `reviewed: false` to contain a good detailed changelog information.

ensure your new reviewed file updated the reviewed meta to `reviewed: true`

ensure every changelog file has a headline title. the title should be the biggest, most impactful feature/fix/item that we have changed.

order the information in terms of impact with the biggest, more impactful items being to the top, with the smallest, least likely people care about to the. bottom.

try and keep your new changelog consisten with the other ones.
