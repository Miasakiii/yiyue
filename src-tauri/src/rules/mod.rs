pub mod presets;

use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub replacement: String,
    pub scope: String,
    pub is_regex: bool,
    pub enabled: bool,
    pub priority: i64,
    pub group_id: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleGroup {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_preset: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleSet {
    pub group: RuleGroup,
    pub rules: Vec<Rule>,
}

/// Apply a set of rules to text, returning the cleaned text and replacement count.
pub fn apply_rules(text: &str, rules: &[Rule]) -> (String, usize) {
    let mut result = text.to_string();
    let mut total_replacements = 0;

    // Sort by priority descending
    let mut sorted_rules: Vec<&Rule> = rules.iter().filter(|r| r.enabled).collect();
    sorted_rules.sort_by(|a, b| b.priority.cmp(&a.priority));

    for rule in &sorted_rules {
        if rule.scope != "global" && rule.scope != "chapter" {
            continue;
        }

        let count = if rule.is_regex {
            match Regex::new(&rule.pattern) {
                Ok(re) => {
                    let before = result.clone();
                    result = re.replace_all(&result, rule.replacement.as_str()).to_string();
                    // Count replacements
                    before.matches(&rule.pattern).count().max(
                        (before.len() - result.len()) / 1.max(rule.pattern.len() - rule.replacement.len()),
                    )
                }
                Err(_) => 0,
            }
        } else {
            let count = result.matches(&rule.pattern).count();
            result = result.replace(&rule.pattern, &rule.replacement);
            count
        };

        total_replacements += count;
    }

    (result, total_replacements)
}

/// Normalize text formatting: merge consecutive blank lines, trim whitespace.
pub fn normalize_text(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut result = Vec::new();
    let mut prev_blank = false;

    for line in &lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !prev_blank {
                result.push("");
                prev_blank = true;
            }
        } else {
            result.push(trimmed);
            prev_blank = false;
        }
    }

    // Remove trailing blank lines
    while result.last().map_or(false, |l| l.is_empty()) {
        result.pop();
    }

    result.join("\n")
}
