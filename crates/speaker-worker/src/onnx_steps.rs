//! Chạy đồ thị ONNX từng nút (cách B', spec 2026-10-26-phan-biet-nguoi-noi §4.1; bench/2026-10-26-nguoi-noi/results/ram.md).
//!
//! `candle_onnx::simple_eval` giữ mọi tensor trung gian tới hết lượt chạy, nên RSS chạy lâu của ERes2Net lên 1,5 GB. Ở đây đồ thị
//! được tách lúc nạp thành các graph con một nút; mỗi lượt gọi `simple_eval` cho từng nút và bỏ mỗi giá trị ngay sau lần dùng
//! cuối. Trọng số (initializer) chuyển thành tensor một lần lúc nạp, truyền vào từng nút như đầu vào (chép `Arc`, không chép dữ
//! liệu). Kết quả giống hệt từng bit `simple_eval` cả đồ thị (test ở đây với đồ thị nhỏ; test `#[ignore]` với model thật ở
//! `embed.rs`).
//!
//! Dựa vào một hành vi chưa ghi thành tài liệu của candle-onnx 0.11.0: graph con không khai `input` vẫn chạy (`simple_eval` chỉ
//! kiểm các đầu vào được khai). Vì vậy lúc nạp module này tự kiểm điều `simple_eval` không còn kiểm: đầu vào chính (f32, hạng 3,
//! chiều cuối đúng), mọi đầu vào của nút đã có trước nút đó (thứ tự topo), tên không trùng, không có graph lồng (`If`, `Loop`,
//! `Scan`). **Nâng candle-onnx thì chạy lại test giống từng bit** (`embed::tests::steps_match_simple_eval_on_the_real_model`).

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result, bail, ensure};
use candle_core::Tensor;
use candle_onnx::onnx::tensor_proto::DataType;
use candle_onnx::onnx::tensor_shape_proto::dimension::Value as Dim;
use candle_onnx::onnx::type_proto::Value as TypeValue;
use candle_onnx::onnx::{GraphProto, ModelProto, NodeProto, ValueInfoProto};

/// Một nút, dưới dạng graph con chạy được bằng `simple_eval`.
struct Step {
    model: ModelProto,
    /// Tên các đầu vào (không rỗng, không trùng), theo thứ tự xuất hiện.
    inputs: Vec<String>,
    /// Giá trị trung gian hết lần dùng sau nút này.
    drop_after: Vec<String>,
    /// Để báo lỗi: số thứ tự, loại và tên nút.
    label: String,
}

pub struct StepGraph {
    steps: Vec<Step>,
    weights: HashMap<String, Tensor>,
    input: String,
    output: String,
}

fn node_label(i: usize, node: &NodeProto) -> String {
    format!("nút {i} ({} `{}`)", node.op_type, node.name)
}

/// Đầu vào chính phải được khai: tensor f32, hạng 3, chiều cuối `last_dim` (fbank 80 dải với ERes2Net).
fn check_input(graph: &GraphProto, input: &str, last_dim: usize) -> Result<()> {
    let info = graph
        .input
        .iter()
        .find(|i| i.name == input)
        .with_context(|| format!("model không có input `{input}`"))?;
    let Some(TypeValue::TensorType(t)) = info.r#type.as_ref().and_then(|t| t.value.as_ref()) else {
        bail!("input `{input}` không phải tensor");
    };
    ensure!(t.elem_type == DataType::Float as i32, "input `{input}` không phải f32");
    let dims = &t
        .shape
        .as_ref()
        .with_context(|| format!("input `{input}` không khai hình dạng"))?
        .dim;
    ensure!(dims.len() == 3, "input `{input}` có hạng {}, cần 3", dims.len());
    ensure!(
        matches!(dims[2].value, Some(Dim::DimValue(v)) if v == last_dim as i64),
        "chiều cuối của input `{input}` phải là {last_dim}"
    );
    Ok(())
}

impl StepGraph {
    /// Tách `model` thành từng nút. `input`: tên đầu vào chính (tensor f32 hạng 3, chiều cuối `last_dim`); `output`: tên đầu
    /// ra cần lấy.
    pub fn from_model(model: ModelProto, input: &str, output: &str, last_dim: usize) -> Result<Self> {
        // Graph con mang cùng `ir_version`, `opset_import` với model gốc (`results/ram.md`, "Ghi cho kế hoạch 02"): candle-onnx
        // 0.11.0 chưa đọc hai trường này, nhưng bản sau có thể chọn cách chạy op theo opset.
        let (ir_version, opset_import) = (model.ir_version, model.opset_import.clone());
        let mut graph = model.graph.context("model ONNX không có graph")?;
        check_input(&graph, input, last_dim)?;
        let weights: HashMap<String, Tensor> = std::mem::take(&mut graph.initializer)
            .iter()
            .map(|t| Ok((t.name.clone(), candle_onnx::eval::get_tensor(t, &t.name)?)))
            .collect::<Result<_>>()?;
        ensure!(!weights.contains_key(input), "initializer trùng tên đầu vào `{input}`");
        let mut known: HashSet<String> = weights.keys().cloned().collect();
        known.insert(input.to_string());
        let mut produced: HashSet<&str> = HashSet::new();
        for (i, node) in graph.node.iter().enumerate() {
            let label = node_label(i, node);
            ensure!(
                !node.attribute.iter().any(|a| a.g.is_some() || !a.graphs.is_empty()),
                "{label}: có graph lồng (If, Loop, Scan), chưa hỗ trợ"
            );
            for name in node.input.iter().filter(|n| !n.is_empty()) {
                ensure!(
                    known.contains(name),
                    "{label}: cần `{name}` mà chưa nút nào trước đó tạo ra (đồ thị không theo thứ tự topo?)"
                );
            }
            for name in node.output.iter().filter(|n| !n.is_empty()) {
                ensure!(
                    known.insert(name.clone()),
                    "{label}: đầu ra `{name}` trùng tên một giá trị đã có"
                );
                produced.insert(name);
            }
        }
        ensure!(produced.contains(output), "không có nút nào tạo ra output `{output}`");
        let mut last_use: HashMap<&str, usize> = HashMap::new();
        for (i, node) in graph.node.iter().enumerate() {
            for name in node.input.iter().filter(|n| !n.is_empty()) {
                last_use.insert(name, i);
            }
        }
        ensure!(last_use.contains_key(input), "không nút nào dùng input `{input}`");
        let steps = graph
            .node
            .iter()
            .enumerate()
            .map(|(i, node)| {
                let mut inputs: Vec<String> = Vec::new();
                for name in node.input.iter().filter(|n| !n.is_empty()) {
                    if !inputs.contains(name) {
                        inputs.push(name.clone());
                    }
                }
                // Chỉ khai đầu ra còn được dùng sau nút này hay là đầu ra đồ thị: `simple_eval` không trả đầu ra không khai,
                // nên giá trị không ai dùng (ví dụ một nhánh của `Split`) bị bỏ ngay khi nút chạy xong.
                let outputs = node
                    .output
                    .iter()
                    .filter(|o| {
                        !o.is_empty() && (o.as_str() == output || last_use.get(o.as_str()).is_some_and(|&l| l > i))
                    })
                    .map(|o| ValueInfoProto {
                        name: o.clone(),
                        ..Default::default()
                    })
                    .collect();
                let drop_after = inputs
                    .iter()
                    .filter(|n| !weights.contains_key(*n) && n.as_str() != output && last_use[n.as_str()] == i)
                    .cloned()
                    .collect();
                Step {
                    model: ModelProto {
                        ir_version,
                        opset_import: opset_import.clone(),
                        graph: Some(GraphProto {
                            node: vec![node.clone()],
                            output: outputs,
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    inputs,
                    drop_after,
                    label: node_label(i, node),
                }
            })
            .collect();
        Ok(Self {
            steps,
            weights,
            input: input.to_string(),
            output: output.to_string(),
        })
    }

    /// Chạy một lượt với đầu vào chính `x`; trả đầu ra.
    pub fn run(&self, x: Tensor) -> Result<Tensor> {
        self.run_with(x, &mut |_| {})
    }

    /// Như [`Self::run`]; `after_step` nhận số giá trị trung gian còn giữ sau mỗi nút (test đếm giá trị còn sống).
    fn run_with(&self, x: Tensor, after_step: &mut dyn FnMut(usize)) -> Result<Tensor> {
        let mut live: HashMap<String, Tensor> = HashMap::from([(self.input.clone(), x)]);
        for step in &self.steps {
            let mut inputs = HashMap::with_capacity(step.inputs.len());
            for name in &step.inputs {
                let t = live
                    .get(name)
                    .or_else(|| self.weights.get(name))
                    .with_context(|| format!("{}: thiếu `{name}`", step.label))?;
                inputs.insert(name.clone(), t.clone());
            }
            let out = candle_onnx::simple_eval(&step.model, inputs).with_context(|| step.label.clone())?;
            for name in &step.drop_after {
                live.remove(name);
            }
            live.extend(out);
            after_step(live.len());
        }
        let out = live.remove(&self.output).context("thiếu đầu ra sau lượt chạy")?;
        debug_assert!(
            live.is_empty(),
            "còn giá trị trung gian chưa bỏ: {:?}",
            live.keys().collect::<Vec<_>>()
        );
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;
    use candle_onnx::onnx::attribute_proto::AttributeType;
    use candle_onnx::onnx::tensor_shape_proto::Dimension;
    use candle_onnx::onnx::{AttributeProto, NodeProto, TensorProto, TensorShapeProto, TypeProto, type_proto};

    /// Đầu vào `x` kiểu f32, hình `[N, T, last]`.
    fn x_info(elem_type: DataType, last: i64, rank: usize) -> ValueInfoProto {
        let dims = [
            Dim::DimParam("N".into()),
            Dim::DimParam("T".into()),
            Dim::DimValue(last),
        ];
        ValueInfoProto {
            name: "x".into(),
            r#type: Some(TypeProto {
                value: Some(TypeValue::TensorType(type_proto::Tensor {
                    elem_type: elem_type as i32,
                    shape: Some(TensorShapeProto {
                        dim: dims[3 - rank..]
                            .iter()
                            .map(|d| Dimension {
                                value: Some(d.clone()),
                                ..Default::default()
                            })
                            .collect(),
                    }),
                })),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    fn node(op: &str, inputs: &[&str], outputs: &[&str]) -> NodeProto {
        NodeProto {
            op_type: op.into(),
            name: format!("{op}_{}", outputs[0]),
            input: inputs.iter().map(|s| s.to_string()).collect(),
            output: outputs.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    fn floats(name: &str, dims: &[i64], data: &[f32]) -> TensorProto {
        TensorProto {
            name: name.into(),
            dims: dims.to_vec(),
            data_type: DataType::Float as i32,
            float_data: data.to_vec(),
            ..Default::default()
        }
    }

    fn int_attr(name: &str, i: i64) -> AttributeProto {
        AttributeProto {
            name: name.into(),
            r#type: AttributeType::Int as i32,
            i,
            ..Default::default()
        }
    }

    /// Đồ thị gồm các ca biên của `ram.md` (mục "Ghi cho kế hoạch 02"):
    /// - `Constant` `c` dùng ở ba nút xa nhau (n1, n5, n6);
    /// - `Split` có đầu ra `s2` không ai dùng;
    /// - `Mul(s1, s1)` (một tên hai lần);
    /// - `Clip` có đầu vào `""` (min bỏ trống) và max là trọng số;
    /// - đầu ra đồ thị `out` bị nút sau (n6) dùng; đầu ra `z` của n6 không ai dùng.
    fn edge_model() -> ModelProto {
        let mut constant = node("Constant", &[], &["c"]);
        constant.attribute.push(AttributeProto {
            name: "value".into(),
            r#type: AttributeType::Tensor as i32,
            t: Some(floats("c", &[1], &[2.0])),
            ..Default::default()
        });
        let mut split = node("Split", &["a"], &["s1", "s2"]);
        split.attribute.push(int_attr("axis", 2));
        ModelProto {
            graph: Some(GraphProto {
                node: vec![
                    constant,
                    node("Mul", &["x", "c"], &["a"]),
                    split,
                    node("Mul", &["s1", "s1"], &["sq"]),
                    node("Clip", &["sq", "", "hi"], &["cl"]),
                    node("Add", &["cl", "c"], &["out"]),
                    node("Add", &["out", "c"], &["z"]),
                ],
                initializer: vec![floats("hi", &[1], &[1.5])],
                input: vec![x_info(DataType::Float, 4, 3)],
                output: vec![ValueInfoProto {
                    name: "out".into(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    fn x(frames: usize) -> Tensor {
        let data: Vec<f32> = (0..frames * 4).map(|i| i as f32 * 0.1 - 0.7).collect();
        Tensor::from_vec(data, (1, frames, 4), &Device::Cpu).unwrap()
    }

    fn bits(t: &Tensor) -> Vec<u32> {
        t.flatten_all()
            .unwrap()
            .to_vec1::<f32>()
            .unwrap()
            .iter()
            .map(|v| v.to_bits())
            .collect()
    }

    /// Cả đồ thị một lượt bằng `simple_eval` (cách cũ), để so.
    fn whole(model: &ModelProto, x: Tensor) -> Tensor {
        candle_onnx::simple_eval(model, HashMap::from([("x".to_string(), x)]))
            .unwrap()
            .remove("out")
            .unwrap()
    }

    #[test]
    fn steps_give_the_same_bits_as_the_whole_graph() {
        let steps = StepGraph::from_model(edge_model(), "x", "out", 4).unwrap();
        // Hai lượt liền nhau, độ dài khác nhau: không giữ trạng thái giữa hai lượt.
        for frames in [3, 5, 3] {
            assert_eq!(
                bits(&steps.run(x(frames)).unwrap()),
                bits(&whole(&edge_model(), x(frames))),
                "{frames}"
            );
        }
    }

    /// Bỏ sót một giá trị không đổi kết quả (test trên vẫn đạt) mà chỉ làm RAM tăng: đếm số giá trị còn giữ sau mỗi nút.
    /// Tính tay: {x} → n0 {x, c} → n1 bỏ x {c, a} → n2 bỏ a, s2 không giữ {c, s1} → n3 bỏ s1 {c, sq} → n4 bỏ sq {c, cl}
    /// → n5 bỏ cl {c, out} → n6 bỏ c, giữ out (đầu ra đồ thị), z không giữ {out}.
    #[test]
    fn values_are_dropped_right_after_their_last_use() {
        let steps = StepGraph::from_model(edge_model(), "x", "out", 4).unwrap();
        let mut live = Vec::new();
        steps.run_with(x(3), &mut |n| live.push(n)).unwrap();
        assert_eq!(live, [2, 2, 2, 2, 2, 2, 1]);
    }

    fn rejects(model: ModelProto, last: usize, needle: &str) {
        let err = StepGraph::from_model(model, "x", "out", last)
            .err()
            .expect("phải từ chối");
        assert!(format!("{err:#}").contains(needle), "{err:#}");
    }

    #[test]
    fn a_nested_graph_is_rejected() {
        let mut m = edge_model();
        let mut branch = node("If", &["x"], &["y"]);
        branch.attribute.push(AttributeProto {
            name: "then_branch".into(),
            r#type: AttributeType::Graph as i32,
            g: Some(GraphProto::default()),
            ..Default::default()
        });
        m.graph.as_mut().unwrap().node.insert(0, branch);
        rejects(m, 4, "graph lồng");
    }

    #[test]
    fn a_node_out_of_topological_order_is_rejected() {
        let mut m = edge_model();
        m.graph.as_mut().unwrap().node.swap(1, 2);
        rejects(m, 4, "chưa nút nào trước đó");
    }

    #[test]
    fn a_duplicate_name_is_rejected() {
        let mut m = edge_model();
        m.graph.as_mut().unwrap().node[3].output = vec!["a".into()];
        rejects(m, 4, "trùng tên");
    }

    #[test]
    fn a_wrong_main_input_is_rejected() {
        rejects(edge_model(), 80, "chiều cuối");
        let mut m = edge_model();
        m.graph.as_mut().unwrap().input = vec![x_info(DataType::Float, 4, 2)];
        rejects(m, 4, "hạng 2");
        let mut m = edge_model();
        m.graph.as_mut().unwrap().input = vec![x_info(DataType::Int64, 4, 3)];
        rejects(m, 4, "không phải f32");
        let mut m = edge_model();
        m.graph.as_mut().unwrap().input.clear();
        rejects(m, 4, "không có input `x`");
    }

    #[test]
    fn a_missing_output_is_rejected() {
        let mut m = edge_model();
        m.graph.as_mut().unwrap().output[0].name = "khong_co".into();
        let err = StepGraph::from_model(m, "x", "khong_co", 4).err().unwrap();
        assert!(format!("{err:#}").contains("không có nút nào tạo ra"), "{err:#}");
    }
}
