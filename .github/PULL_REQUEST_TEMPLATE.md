## Description
<!-- Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change. -->

Fixes # (issue)

## Type of change
<!-- Please delete options that are not relevant. -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] This change requires a documentation update

## 🚁 Post-Update IRL Field Test Plan
<!-- Describe the In-Real-Life (IRL) field verification steps for this update. Note: IRL verification is a historical reference check only and does NOT guarantee flight safety across varying wind, GNSS, terrain, or OEM firmware conditions. -->

- [ ] `npm run irl:sync` executed to update pattern generator code hashes and `docs/IRL_TEST_PLAN.md`
- [ ] Exported test KMZ at synthetic rural coordinates (`[41.3215, -88.9950]`) and verified WPML schema
- [ ] Post-flight telemetry log analysis (`npm run irl:analyze`) or field checklist steps documented

## Checklist:

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules
