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

#[cfg(test)]
mod tests {
    use super::*;

    fn make_rule(id: &str, pattern: &str, replacement: &str, is_regex: bool, enabled: bool, priority: i64) -> Rule {
        Rule {
            id: id.to_string(),
            name: id.to_string(),
            pattern: pattern.to_string(),
            replacement: replacement.to_string(),
            scope: "global".to_string(),
            is_regex,
            enabled,
            priority,
            group_id: None,
            description: None,
        }
    }

    #[test]
    fn test_apply_rules_literal_replacement() {
        let rules = vec![make_rule("1", "bad", "good", false, true, 100)];
        let (result, count) = apply_rules("this is bad text", &rules);
        assert_eq!(result, "this is good text");
        assert!(count > 0);
    }

    #[test]
    fn test_apply_rules_regex_replacement() {
        let rules = vec![make_rule("1", r"\d+", "NUM", true, true, 100)];
        let (result, _) = apply_rules("abc 123 def 456", &rules);
        assert_eq!(result, "abc NUM def NUM");
    }

    #[test]
    fn test_apply_rules_disabled_rules_skipped() {
        let rules = vec![make_rule("1", "bad", "good", false, false, 100)];
        let (result, count) = apply_rules("this is bad text", &rules);
        assert_eq!(result, "this is bad text");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_apply_rules_priority_ordering() {
        // Higher priority runs first — "aa" → "bb" → "cc" if priority order matters
        let rules = vec![
            make_rule("1", "aa", "bb", false, true, 50),
            make_rule("2", "bb", "cc", false, true, 100),
        ];
        let (result, _) = apply_rules("aa", &rules);
        // Priority 100 runs first (bb→cc), then 50 (aa→bb)
        // So "aa" → "aa" (bb→cc doesn't match) → "bb" (aa→bb matches)
        assert_eq!(result, "bb");
    }

    #[test]
    fn test_apply_rules_invalid_regex_no_panic() {
        let rules = vec![make_rule("1", "[invalid", "x", true, true, 100)];
        let (result, count) = apply_rules("test [invalid text", &rules);
        // Invalid regex should be skipped, not panic
        assert_eq!(result, "test [invalid text");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_apply_rules_empty_text() {
        let rules = vec![make_rule("1", "x", "y", false, true, 100)];
        let (result, count) = apply_rules("", &rules);
        assert_eq!(result, "");
        assert_eq!(count, 0);
    }
}
