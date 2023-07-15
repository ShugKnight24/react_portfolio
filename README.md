# Shumunov Portfolio

The React code of my [portfolio site](ShugKnight24.github.io)

## Review

Improve site as it has become old & stale...
Update design
  - integrate new layouts
    - Especially on projects
Update content & copy
See how easy to simplify build process (remove webpack etc...)

## To-Do
- Automate workflows
- Add way to differentiate audio books in UI
- Improve use of Typescript
- Move away from GetColumnsHook
  - Pass in images and use a flex grid
  - [ ] Update Image columns based off resize events
    - responsiveness not great on resize / based off load
    - Or... add column # to columns class and improve the media queries
    - Will this even be a problem once a flex grid is used?
- Refactor Skills & TechIcons
  - Clean up SkillsInterface
  - Add SVGs to tech & skills sections
  - Refactor TechSkills Component
  - Refactor Data to have groupings / headers
  - Update how skills section is built
    - Add tech stack to positions
    - build from dataset
- [ ] Add a blog
- [ ] Move away from using `dangerouslySetInnerHTML`
- [ ] Create Media Section (Movies & TV)
  - [ ] Completed ... Started... Improved version of books
- [ ] Update Experience section
  - how components are built
    - Map from dataset
- [ ] Move to functional components
- [ ] Add content to Books page
  - [ ] Amazon link
  - [ ] GoodReads link
  - [ ] GoodReads Rating
  - [ ] Longterm - Blurb / Reviews
- [X] Add JS30 Section
  - [ ] Add project descriptions
- [ ] Button Sizing

## Done
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
