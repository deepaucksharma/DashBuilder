# Documentation Maintenance Guidelines

This guide ensures consistent, accurate, and maintainable documentation for the DashBuilder project.

## Core Principles

### 1. Single Source of Truth
- Each concept should be documented in **ONE place only**
- Avoid duplicating information across multiple files
- Use cross-references instead of copying content

### 2. Reflect Current Implementation
- Documentation must match the actual codebase
- Update docs as part of feature development
- Remove documentation for deprecated features

### 3. Clear Naming Conventions
- Use descriptive file names (e.g., `deployment-guide.md` not `deploy.md`)
- Avoid version numbers in filenames (use git history)
- No "final", "fixed", "proper" in documentation names

## Documentation Structure

### Primary Documentation (`/docs/`)
```
docs/
├── README.md                    # Documentation index and navigation
├── architecture.md              # System design and components
├── api-reference.md            # Complete API documentation
├── deployment-guide.md         # All deployment methods
├── production-setup.md         # Production best practices
├── TROUBLESHOOTING_RUNBOOK.md  # Common issues and solutions
├── EXPERIMENT_TRACKING_GUIDE.md # Experiment framework guide
├── DOCKER-MONITORING-GUIDE.md   # Container monitoring setup
├── ADVANCED_SCENARIOS.md       # Complex use cases
├── migration-from-v1.md        # Version migration guide
└── archive/                    # Historical/deprecated docs
```

### Component Documentation
- Each major component should have its own README.md
- Examples: `/dashboard-generator/README.md`, `/experiments/README.md`
- Focus on component-specific details, reference main docs for system-wide concepts

## Writing Guidelines

### 1. Use Clear Headers
```markdown
# Main Title (one per document)
## Major Sections
### Subsections
#### Details (sparingly)
```

### 2. Include Practical Examples
- Show real command-line examples
- Include expected output
- Provide copy-paste ready code

### 3. Cross-Reference Properly
```markdown
<!-- Good -->
See [Architecture](./architecture.md) for system design details.

<!-- Bad -->
The system uses a modular architecture with... (duplicating content)
```

### 4. Keep It Current
- Remove references to deprecated features
- Update examples to use latest APIs
- Verify all links work

## Maintenance Process

### When Adding Features
1. Update relevant documentation
2. Add examples to guides
3. Update API reference if needed
4. Check for broken cross-references

### When Deprecating Features
1. Move old docs to `/docs/archive/`
2. Update all references
3. Add migration notes if needed
4. Update main README.md

### Regular Reviews
- Monthly: Check for broken links
- Quarterly: Review accuracy against codebase
- Yearly: Archive outdated content

## Common Pitfalls to Avoid

### 1. Multiple Architecture Documents
❌ Creating new architecture docs for each approach
✅ Update the single `architecture.md` file

### 2. Version Numbers in Filenames
❌ `dashboard-v2-final.md`, `api-reference-2024.md`
✅ `dashboard.md`, `api-reference.md` (use git for versions)

### 3. Duplicate Guides
❌ Multiple deployment guides for different scenarios
✅ Single `deployment-guide.md` with sections for each scenario

### 4. Experimental Documentation
❌ Keeping prototype/experiment docs in main folder
✅ Use `/docs/archive/` or feature branches

## Documentation Review Checklist

Before committing documentation:

- [ ] Is this updating existing docs or creating new ones?
- [ ] Are all cross-references valid?
- [ ] Do examples work with current code?
- [ ] Is similar content already documented elsewhere?
- [ ] Are deprecated features removed/archived?
- [ ] Is the naming convention followed?

## Archival Process

When archiving documentation:

1. Create appropriate subdirectory in `/docs/archive/`
2. Move files with `git mv` to preserve history
3. Add README.md to archive folder explaining why archived
4. Update any references to point to new locations
5. Consider if any content should be preserved in current docs

## Tools and Automation

### Link Checking
```bash
# Find broken internal links
grep -r "\[.*\](.*.md)" docs/ | grep -v archive
```

### Documentation Linting
- Use markdownlint for consistent formatting
- Check for broken links in CI/CD pipeline
- Validate code examples where possible

## Examples of Good Documentation

### Clear Structure
See `docs/architecture.md` - single source for all architecture information

### Good Cross-References
See `docs/README.md` - central navigation without duplicating content

### Practical Examples
See `docs/deployment-guide.md` - real commands with expected output

## Getting Help

- Check existing documentation first
- Ask in team chat before creating new docs
- Review these guidelines before major documentation work
- When in doubt, update existing docs rather than create new ones

---

*Last Updated: November 2024*