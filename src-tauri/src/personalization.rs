//! Only explicitly saved corrections are deterministic. Never recursively rewrite
//! replacements, and do not replace an ASCII term inside a larger identifier.
use crate::llm::CorrectionRule;
use std::borrow::Cow;

pub fn correct<'a>(text: &'a str, rules: &[CorrectionRule]) -> Cow<'a, str> {
    let mut relevant: Vec<_> = rules
        .iter()
        .filter(|r| r.enabled && !r.pattern.is_empty() && text.contains(&r.pattern))
        .collect();
    if relevant.is_empty() {
        return Cow::Borrowed(text);
    }
    relevant.sort_by_key(|r| std::cmp::Reverse(r.pattern.len()));
    let word = |c: char| c.is_ascii_alphanumeric() || c == '_';
    let mut output = String::with_capacity(text.len());
    let mut offset = 0;
    while offset < text.len() {
        let rule = relevant.iter().find(|r| {
            text[offset..].starts_with(&r.pattern)
                && !(r.pattern.chars().next().is_some_and(word)
                    && text[..offset].chars().next_back().is_some_and(word))
                && !(r.pattern.chars().next_back().is_some_and(word)
                    && text[offset + r.pattern.len()..]
                        .chars()
                        .next()
                        .is_some_and(word))
        });
        if let Some(rule) = rule {
            output.push_str(&rule.replacement);
            offset += rule.pattern.len();
        } else if let Some(c) = text[offset..].chars().next() {
            output.push(c);
            offset += c.len_utf8();
        }
    }
    Cow::Owned(output)
}

/// Small, separate ASR hint budget. Newest manual terms arrive first from storage.
pub fn hotwords(words: &[String]) -> Vec<String> {
    let mut remaining = 80;
    words
        .iter()
        .filter_map(|word| {
            let count = word.chars().count();
            if count == 0 || count > remaining {
                return None;
            }
            remaining -= count;
            Some(word.clone())
        })
        .take(20)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rule(pattern: &str, replacement: &str) -> CorrectionRule {
        CorrectionRule {
            id: 1,
            pattern: pattern.into(),
            replacement: replacement.into(),
            enabled: true,
        }
    }
    #[test]
    fn corrections_are_longest_non_cascading_and_preserve_identifiers() {
        let rules = [
            rule("欧盆", "wrong"),
            rule("欧盆FHE", "OpenFHE"),
            rule("OpenFHE", "changed"),
            rule("API", "接口"),
        ];
        assert_eq!(
            correct("欧盆FHE API API_KEY 123", &rules),
            "OpenFHE 接口 API_KEY 123"
        );
    }
    #[test]
    fn disabled_rules_and_absent_matches_leave_text_borrowed() {
        let mut r = rule("test", "bad");
        r.enabled = false;
        assert!(matches!(correct("test", &[r]), Cow::Borrowed(_)));
    }
    #[test]
    fn hotwords_are_bounded() {
        let words = vec!["OpenFHE".into(); 5000];
        let selected = hotwords(&words);
        assert!(selected.len() <= 20);
        assert!(selected.iter().map(|s| s.chars().count()).sum::<usize>() <= 80);
    }
}
