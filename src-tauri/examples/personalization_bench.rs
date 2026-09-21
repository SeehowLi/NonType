use opentypeless_lib::{llm::CorrectionRule, personalization};
fn main() {
    for count in [500, 5000] {
        let mut rules: Vec<_> = (0..count)
            .map(|id| CorrectionRule {
                id,
                pattern: format!("误听词{id}"),
                replacement: format!("Term{id}"),
                enabled: true,
            })
            .collect();
        rules.push(CorrectionRule {
            id: count,
            pattern: "欧盆FHE".into(),
            replacement: "OpenFHE".into(),
            enabled: true,
        });
        let text = "请用欧盆FHE检查CKKS参数，保留数字123和文件config.yaml。".repeat(10);
        let mut times = Vec::new();
        for _ in 0..100 {
            let start = std::time::Instant::now();
            let result = personalization::correct(std::hint::black_box(&text), &rules);
            assert!(result.contains("OpenFHE"));
            times.push(start.elapsed().as_micros());
        }
        times.sort_unstable();
        println!(
            "rules={count} samples=100 correction_p50_us={} correction_p95_us={}",
            times[49], times[94]
        );
    }
}
