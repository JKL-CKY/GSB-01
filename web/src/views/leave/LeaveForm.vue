<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v) => emit('update:modelValue', v)"
    :title="form.id ? '编辑请假申请' : '新建请假申请'"
    width="520px"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
      <el-form-item label="请假类型" prop="leaveType">
        <el-select v-model="form.leaveType" style="width:100%">
          <el-option v-for="(v, k) in LEAVE_TYPE" :key="k" :label="v.label" :value="k" />
        </el-select>
      </el-form-item>
      <el-form-item label="起止时间" prop="range">
        <el-date-picker
          v-model="form.range" type="datetimerange" range-separator="至"
          start-placeholder="开始时间" end-placeholder="结束时间"
          value-format="YYYY-MM-DD HH:mm" style="width:100%" @change="onRangeChange"
        />
      </el-form-item>
      <el-form-item label="请假时长" prop="duration">
        <el-input-number v-model="form.duration" :min="0.5" :max="30" :step="0.5" :precision="1" />
        <span class="dur-tip">天（每天按 8 小时计，可手动微调为半天）</span>
      </el-form-item>
      <el-form-item label="请假事由" prop="reason">
        <el-input v-model="form.reason" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="请说明请假原因" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button @click="submit(false)" :loading="saving">存草稿</el-button>
      <el-button type="primary" @click="submit(true)" :loading="saving">提交审批</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api, authStore } from '../../api';
import { LEAVE_TYPE } from '../../utils/dict';

const props = defineProps({
  modelValue: Boolean,
  record: { type: Object, default: null },
});
const emit = defineEmits(['update:modelValue', 'saved']);

const formRef = ref();
const saving = ref(false);
const form = reactive({ id: null, employeeId: null, leaveType: 'personal', range: [], duration: 1, reason: '' });

const rules = {
  leaveType: [{ required: true, message: '请选择请假类型', trigger: 'change' }],
  range: [{ required: true, type: 'array', validator: (r, v, cb) => {
    if (!v || v.length !== 2 || !v[0] || !v[1]) cb(new Error('请选择起止时间'));
    else cb();
  }, trigger: 'change' }],
  duration: [{ required: true, message: '请填写时长', trigger: 'blur' }],
  reason: [{ required: true, message: '请填写请假事由', trigger: 'blur' }],
};

watch(() => props.modelValue, (open) => {
  if (!open) return;
  const r = props.record;
  if (r) {
    Object.assign(form, {
      id: r.id, employeeId: r.employee_id, leaveType: r.leave_type,
      range: [r.start_time, r.end_time], duration: r.duration, reason: r.reason,
    });
  } else {
    Object.assign(form, { id: null, employeeId: null, leaveType: 'personal', range: [], duration: 1, reason: '' });
  }
});

function onRangeChange(v) {
  if (!v || v.length !== 2 || !v[0] || !v[1]) return;
  const hours = (new Date(v[1]) - new Date(v[0])) / 3600000;
  let days = Math.round((hours / 8) * 2) / 2; // 0.5 天为粒度
  form.duration = Math.max(0.5, days);
}

async function submit(submitFlag) {
  await formRef.value.validate().catch(() => { throw new Error('validate'); });
  saving.value = true;
  try {
    const payload = {
      leaveType: form.leaveType,
      startTime: form.range[0], endTime: form.range[1],
      duration: form.duration, reason: form.reason, submit: submitFlag,
    };
    if (form.id) await api.put(`/api/leave-requests/${form.id}`, payload);
    else await api.post('/api/leave-requests', payload);
    ElMessage.success(submitFlag ? '已提交，等待审批' : '草稿已保存');
    emit('update:modelValue', false);
    emit('saved');
  } finally { saving.value = false; }
}
</script>

<style scoped>
.dur-tip { margin-left: 10px; color: #94a3b8; font-size: 12px; }
</style>
