"""Đổi Conv stride không đều (2,1) thành Conv stride 1 + Slice bước 2 trên trục thời gian/tần số tương ứng (tương đương toán học)."""
import sys, onnx, numpy as np
from onnx import helper, numpy_helper
m = onnx.load(sys.argv[1]); g = m.graph
new_nodes = []; n_fix = 0
for node in g.node:
    if node.op_type == "Conv":
        st = next((a for a in node.attribute if a.name == "strides"), None)
        if st is not None and len(set(st.ints)) > 1:
            strides = list(st.ints)
            st.ints[:] = [1] * len(strides)
            out = node.output[0]; tmp = out + "_s1"; node.output[0] = tmp
            new_nodes.append(node)
            for ax, s in enumerate(strides):
                if s == 1: continue
                nm = f"{out}_sl{ax}"
                starts = numpy_helper.from_array(np.array([0], np.int64), nm + "_st")
                ends = numpy_helper.from_array(np.array([2**62], np.int64), nm + "_en")
                axes = numpy_helper.from_array(np.array([2 + ax], np.int64), nm + "_ax")
                steps = numpy_helper.from_array(np.array([s], np.int64), nm + "_sp")
                g.initializer.extend([starts, ends, axes, steps])
                new_nodes.append(helper.make_node("Slice", [tmp, starts.name, ends.name, axes.name, steps.name], [out], name=nm))
            n_fix += 1
            continue
    new_nodes.append(node)
del g.node[:]; g.node.extend(new_nodes)
onnx.save(m, sys.argv[2]); print("sửa", n_fix, "Conv")
