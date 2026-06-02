use super::{Rule, RuleGroup, RuleSet};

/// Preset rule group for Chinese web novel noise filtering.
pub fn web_novel_cleaner() -> RuleSet {
    RuleSet {
        group: RuleGroup {
            id: "preset-web-novel".to_string(),
            name: "网文清洗套装".to_string(),
            description: Some("适用于常见中文网络小说的干扰词过滤规则".to_string()),
            is_preset: true,
            enabled: true,
        },
        rules: vec![
            Rule {
                id: "wn-url".to_string(),
                name: "去除网址".to_string(),
                pattern: r"(?:https?://|www\.)[\w.-]+\.[a-z]{2,}(?:/[\w./?%&=-]*)?".to_string(),
                replacement: String::new(),
                scope: "global".to_string(),
                is_regex: true,
                enabled: true,
                priority: 100,
                group_id: Some("preset-web-novel".to_string()),
                description: Some("去除各种网址链接".to_string()),
            },
            Rule {
                id: "wn-site-watermark".to_string(),
                name: "去除网站水印".to_string(),
                pattern: r"(?:笔趣阁|起点中文网|纵横中文网|17k\.com|qidian\.com|zongheng\.com|手机阅读|请收藏|最新章节|手机站|电脑版|加入书签|收藏本站|请记住|本章未完|点击下一页).*(?:\.com|\.cn|\.net|\.org)?"
                    .to_string(),
                replacement: String::new(),
                scope: "global".to_string(),
                is_regex: true,
                enabled: true,
                priority: 95,
                group_id: Some("preset-web-novel".to_string()),
                description: Some("去除常见网文网站的水印文字".to_string()),
            },
            Rule {
                id: "wn-ad-植入".to_string(),
                name: "去除广告植入".to_string(),
                pattern: r"(?:最新章节|全文阅读|最快更新|无弹窗|无广告|免费阅读|TXT下载|电子书下载|手打全文字|文字首发|本文由|提供最新章节|手打更新|纯文字).*(?:\.com|\.cn|\.net)?"
                    .to_string(),
                replacement: String::new(),
                scope: "global".to_string(),
                is_regex: true,
                enabled: true,
                priority: 90,
                group_id: Some("preset-web-novel".to_string()),
                description: Some("去除广告植入文字".to_string()),
            },
            Rule {
                id: "wn-copyright".to_string(),
                name: "去除版权声明".to_string(),
                pattern: r"(?:本章完|未完待续|求推荐票|求月票|求打赏|求订阅|感谢.*打赏|感谢.*月票|推荐票|月票|打赏|订阅).*(?:\n|$)"
                    .to_string(),
                replacement: "\n".to_string(),
                scope: "global".to_string(),
                is_regex: true,
                enabled: true,
                priority: 80,
                group_id: Some("preset-web-novel".to_string()),
                description: Some("去除章末的版权和求票文字".to_string()),
            },
            Rule {
                id: "wn-garbled".to_string(),
                name: "去除乱码".to_string(),
                pattern: r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]".to_string(),
                replacement: String::new(),
                scope: "global".to_string(),
                is_regex: true,
                enabled: true,
                priority: 110,
                group_id: Some("preset-web-novel".to_string()),
                description: Some("去除控制字符和乱码".to_string()),
            },
            Rule {
                id: "wn-excessive-blanks".to_string(),
                name: "合并多余空行".to_string(),
                pattern: r"\n{3,}".to_string(),
                replacement: "\n\n".to_string(),
                scope: "global".to_string(),
                is_regex: true,
                enabled: true,
                priority: 50,
                group_id: Some("preset-web-novel".to_string()),
                description: Some("将连续多个空行合并为两个".to_string()),
            },
        ],
    }
}
