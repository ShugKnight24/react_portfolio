# Shumunov Portfolio

The React code of my [portfolio site](ShugKnight24.github.io)

## Review

Improve site it's old & stale...

- System design
  - currently a mess
- Especially the design
- integrate new layouts
  - Photo gallery & projects
- Update content & copy
- Update UI

  - Move to new style system - tailwind, chakra, emotion etc
    - At very least make styles consistent & improve responsiveness
  - Simplify and update content

- Further Improve Projects

  - Update out of date projects & Add most recent projects
  - Add "featured" section?
  - Allow users to click into projects for more info?
    - modal system?

- Add Themeing

  - Light / Dark / Custom modes
  - use Context API
  - move away from scss vars to css vars for colors

- Combine About & Contact

## To-Do

- Improve differential rendering on feed
  - Add multimedia posts or consolidate to a single type
- Refactor BooksPage, PhotoGallery, ProjectsPage, and ResumePage (Experience & Education)
  - Add a filter / search bar
  - Improve UI
  - Update content to latest
  - [ ] Create Media Section (Movies, TV, etc)
    - Make books stuff more generic to handle this
  - (Photo Gal) Move away from GetColumnsHook & simplfy layout
  - (Books) Add additional functionality
    - differentiate audio books, stopped, multiple times, covers, links, ratings, reviews, etc...
- Optimize assets after build prior to deployment
- Fix broken assets
- Update to React 19
- Reoptimize the images used throughout
- convert JS files to TS for typesafety
- Add way to differentiate audio books in UI
- Refactor Skills & TechIcons
  - Clean up SkillsInterface
  - Add SVGs to tech & skills sections
  - Refactor TechSkills Component
  - Refactor Data to have groupings / headers
  - Update how skills section is built
    - Add tech stack to positions
    - build from dataset
- [ ] Add a blog
  - Redundant with feed?
- [x] Add JS30 Section
  - [ ] Add project descriptions
- [ ] Button Sizing

## Done

- [x] Rename Page components, update content & styles, make code declarative and functional - 9/3 -> 9/5
- [x] Update Deps, Update Analytics to GA4, Fix build process - 6/13
- [x] Implement basic feed - 5/23 -> 6/4
- [x] Begin updating Resume content, Update project display - 1/1/24
- [x] Add `ProjectCard` Component, Update projects and associated components - 12/31/23
- [x] Types Cleanup, Update TypeWriter to aceept a list of strings - 12/30/23
- [x] Fix layout shift in hero h1, add `IndentedParagraph` component, update project image pathing, update tech icons, fix layout shift in nav - 12/29/23
- [x] Use vite - 12/26/23
- [x] Refactor Typewriter - 12/18/23
- [x] Remove react-mdl - 8/1 -> 8/22/21
- [x] Add Custom Drawer - 6/23/21
- [x] Converted to Typescript - 6/20 - 6/22/21
- [x] Improve Project Tab Responsiveness - 5/1/21
- [x] Add a photo gallery - 4/19/2021
- [x] Fix console text if in Dark Mode - 8/19/20
- [x] Update layout of books page - 8/18/20
  - [x] Fix responsiveness of layout
- [x] Update Resume section w/ content new from LinkedIn - 8/1
- [x] Optimized images using [ImageOptim](https://imageoptim.com/)
- [x] Add separate Books page
  - [x] Build books page dynamically

## Resolved Bugs

- [x] Clicking on blank space in category drawer and book bar causes error - 8/18/20
