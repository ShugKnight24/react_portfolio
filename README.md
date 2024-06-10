# Shumunov Portfolio

The React code of my [portfolio site](ShugKnight24.github.io)

## Review

Improve site as it has become old & stale...
Update design
  - integrate new layouts
    - Especially on projects
Update content & copy

- Update UI
  - Move to new style system - tailwind, chakra, emotion etc
  - Simplify and update content

- Improve Gallery / Books components
  - Filter by category / genre - add a select dropdown?
  - Add a search bar
  - Convert books to "media"

- Further Improve Projects
  - Add a search bar?
    - Filter by tech?
  - Update out of date projects & Add most recent projects
  - Add a "featured" section?
  - Allow users to click into projects for more info?
    - modal system?

- Update Resume
  - Add new content & improve old content
  - Improve layout and display

- Themeing
  - Light / Dark / Custom modes
  - use Context API
  - move away from scss vars to css vars for colors

- Combine About & Contact?

## To-Do
- Fix feeling is the secret on deployed version.
  - check to see if it's a problem in dev too
  - correct asset if it is
- Update to React 19
- Reoptimize the images used throughout
- convert JS files to TS for typesafety
- Automate workflows
  - Add ci / cd
  - husky / linting / prettier / etc...
- Add way to differentiate audio books in UI
- Improve use of Typescript
- Move away from GetColumnsHook
  - Pass in images and use a flex grid
  - [ ] Update Image columns based off resize events
    - responsiveness not great on resize / based off load
    - Or... add column # to columns class and improve the media queries
    - Will this even be a problem once a flex grid is used?
  - Use similar layout for the feed
- Refactor Skills & TechIcons
  - Clean up SkillsInterface
  - Add SVGs to tech & skills sections
  - Refactor TechSkills Component
  - Refactor Data to have groupings / headers
  - Update how skills section is built
    - Add tech stack to positions
    - build from dataset
- [ ] Add a blog
- [ ] Create Media Section (Movies & TV)
  - [ ] Completed ... Started... Improved version of books
- [ ] Update Experience section
  - how components are built
    - Map from dataset
- [ ] Move to functional components
- [ ] Add content to Books page
  - alternate covers
  - Figure out system for books you stopped
  - how to handle multiple successive reads
  - audio vs physical
  - [ ] Amazon link
  - [ ] GoodReads link
  - [ ] GoodReads Rating
  - [ ] Longterm - Blurb / Reviews
- [X] Add JS30 Section
  - [ ] Add project descriptions
- [ ] Button Sizing

## Done
- [X] Implement basic feed - 5/23 -> 6/4
- [X] Begin updating Resume content, Update project display - 1/1/24
- [X] Add `ProjectCard` Component, Update projects and associated components - 12/31/23
- [X] Types Cleanup, Update TypeWriter to aceept a list of strings - 12/30/23
- [X] Fix layout shift in hero h1, add `IndentedParagraph` component, update project image pathing, update tech icons, fix layout shift in nav - 12/29/23
- [X] Use vite - 12/26/23
- [X] Refactor Typewriter - 12/18/23
- [X] Remove react-mdl - 8/1 -> 8/22/21
- [X] Add Custom Drawer - 6/23/21
- [X] Converted to Typescript - 6/20 - 6/22/21
- [X] Improve Project Tab Responsiveness - 5/1/21
- [X] Add a photo gallery - 4/19/2021
- [X] Fix console text if in Dark Mode - 8/19/20
- [X] Update layout of books page - 8/18/20
  - [X] Fix responsiveness of layout
- [X] Update Resume section w/ content new from LinkedIn - 8/1
- [X] Optimized images using [ImageOptim](https://imageoptim.com/)
- [X] Add separate Books page
  - [X] Build books page dynamically

## Resolved Bugs
- [X] Clicking on blank space in category drawer and book bar causes error - 8/18/20
