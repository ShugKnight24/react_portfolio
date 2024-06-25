# Shumunov Portfolio

The React code of my [portfolio site](ShugKnight24.github.io)

## Review

Improve site as it has become old & stale...
Update design

- integrate new layouts - Especially on projects
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

- Fix differential rendering on feed
  - Add multimedia posts or consolidate to a single type
- Optimize assets after build prior to deployment
- Fix feeling is the secret on deployed version.
  - check to see if it's a problem in dev too
  - correct asset if it is
- Update to React 19
- Reoptimize the images used throughout
- convert JS files to TS for typesafety
- Automate workflows
  - Add ci / cd
  - husky / linting / etc...
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
- [x] Add JS30 Section
  - [ ] Add project descriptions
- [ ] Button Sizing

## Done

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
