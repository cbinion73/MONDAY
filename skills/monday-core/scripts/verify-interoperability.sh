#!/bin/zsh
set -euo pipefail

plugin_root="${1:-/Users/chris/plugins/monday}"
chatgpt_root="${2:-/Users/chris/plugins/monday-chatgpt-skill-upload}"

required=(
  "$plugin_root/skills/monday-core/SKILL.md"
  "$plugin_root/skills/monday-core/references/capability-map.md"
  "$plugin_root/skills/monday-core/references/state-contract.md"
  "$plugin_root/skills/monday-core/references/handoff-protocol.md"
  "$plugin_root/skills/monday-core/references/parity-tests.md"
  "$chatgpt_root/SKILL.md"
)

for file in "${required[@]}"; do
  [[ -f "$file" ]] || { print -u2 "Missing: $file"; exit 1; }
done

for topic in "capability-map.md" "state-contract.md" "handoff-protocol.md" "parity-tests.md"; do
  [[ -f "$chatgpt_root/references/$topic" ]] || { print -u2 "Missing ChatGPT reference: $topic"; exit 1; }
  cmp -s "$plugin_root/skills/monday-core/references/$topic" "$chatgpt_root/references/$topic" || {
    print -u2 "Reference differs: $topic"; exit 1
  }
done

[[ -f "$chatgpt_root/operating-system.md" ]] || { print -u2 "Missing ChatGPT operating-system.md"; exit 1; }
cmp -s "$plugin_root/skills/monday-core/references/operating-system.md" "$chatgpt_root/operating-system.md" || {
  print -u2 "Reference differs: operating-system.md"; exit 1
}

skill_map=(
  "monday-chief-of-staff:chief-of-staff.md"
  "monday-health:health.md"
  "monday-legacy:legacy.md"
  "monday-business-partner:business-partner.md"
  "monday-author-publishing:author-publishing.md"
  "monday-biblical-study:biblical-study.md"
  "monday-research-evidence:research-evidence.md"
  "monday-operating-review-accountability:operating-review-accountability.md"
  "monday-family-household:family-household.md"
  "monday-portfolio-metrics:portfolio-metrics.md"
  "monday-social-audience-growth:social-audience-growth.md"
  "monday-webmaster-growth:webmaster-growth.md"
)

for mapping in "${skill_map[@]}"; do
  plugin_skill="${mapping%%:*}"
  chatgpt_reference="${mapping##*:}"
  plugin_file="$plugin_root/skills/$plugin_skill/SKILL.md"
  chatgpt_file="$chatgpt_root/references/$chatgpt_reference"
  [[ -f "$plugin_file" ]] || { print -u2 "Missing plugin skill: $plugin_file"; exit 1; }
  [[ -f "$chatgpt_file" ]] || { print -u2 "Missing ChatGPT workflow: $chatgpt_file"; exit 1; }
  if [[ "$plugin_skill" == "monday-health" || "$plugin_skill" == "monday-biblical-study" ]]; then
    plugin_normalized="$(mktemp)"
    chatgpt_normalized="$(mktemp)"
    sed -E 's#\[operating-system\.md\]\(\.\./monday-core/references/operating-system\.md\)#`operating-system.md`#' "$plugin_file" | tr -d '[:space:]' > "$plugin_normalized"
    tr -d '[:space:]' < "$chatgpt_file" > "$chatgpt_normalized"
    if ! cmp -s "$plugin_normalized" "$chatgpt_normalized"; then
      rm -f "$plugin_normalized" "$chatgpt_normalized"
      print -u2 "Workflow differs: $plugin_skill / $chatgpt_reference"; exit 1
    fi
    rm -f "$plugin_normalized" "$chatgpt_normalized"
  else
    cmp -s "$plugin_file" "$chatgpt_file" || {
      print -u2 "Workflow differs: $plugin_skill / $chatgpt_reference"; exit 1
    }
  fi
done

rg -q "Cross-surface interoperability" "$plugin_root/skills/monday-core/SKILL.md"
rg -q "Cross-surface interoperability" "$chatgpt_root/SKILL.md"
print "Monday interoperability packages are aligned."
