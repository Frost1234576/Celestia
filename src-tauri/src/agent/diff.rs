use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffLine {
    #[serde(rename = "type")]
    pub kind: String, // "add" | "remove" | "same"
    pub line: String,
    #[serde(rename = "lineNo", skip_serializing_if = "Option::is_none")]
    pub line_no: Option<usize>,
}

pub fn compute_line_diff(before: &str, after: &str) -> Vec<DiffLine> {
    let a: Vec<&str> = before.lines().collect();
    let b: Vec<&str> = after.lines().collect();
    let m = a.len();
    let n = b.len();

    // LCS dp table
    let mut dp = vec![vec![0usize; n + 1]; m + 1];
    for i in (0..m).rev() {
        for j in (0..n).rev() {
            dp[i][j] = if a[i] == b[j] {
                dp[i + 1][j + 1] + 1
            } else {
                dp[i + 1][j].max(dp[i][j + 1])
            };
        }
    }

    let mut out = Vec::new();
    let (mut i, mut j) = (0, 0);
    while i < m && j < n {
        if a[i] == b[j] {
            out.push(DiffLine { kind: "same".into(), line: a[i].to_string(), line_no: Some(i + 1) });
            i += 1;
            j += 1;
        } else if dp[i + 1][j] >= dp[i][j + 1] {
            out.push(DiffLine { kind: "remove".into(), line: a[i].to_string(), line_no: Some(i + 1) });
            i += 1;
        } else {
            out.push(DiffLine { kind: "add".into(), line: b[j].to_string(), line_no: Some(j + 1) });
            j += 1;
        }
    }
    while i < m {
        out.push(DiffLine { kind: "remove".into(), line: a[i].to_string(), line_no: Some(i + 1) });
        i += 1;
    }
    while j < n {
        out.push(DiffLine { kind: "add".into(), line: b[j].to_string(), line_no: Some(j + 1) });
        j += 1;
    }
    out
}
