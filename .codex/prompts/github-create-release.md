Create a new release in the changelog folder and in Githib.

The user must specify the version. If they have not specified the version, asked them.

Steps to create release:

1) Ask the user (if not given) for the version, they will specify either 1.2.3 or v1.2.3 or something similar
2) Create a new changelog/v1.2.3.md file
3) Read some of the other changelog files, so you understand the feel, tone, structure of them and be consistent in yours
4) Create a changelog that covers all the commits from the last release commit, to the current one
5) Save that file, commit and push it to main
6) Use the `gh` cli tool to create the release with the title v1.2.3
