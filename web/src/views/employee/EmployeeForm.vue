<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v) => emit('update:modelValue', v)"
    :title="isEdit ? '编辑员工档案' : '新增员工'"
    width="720px"
    @closed="onClosed"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" v-loading="loading">
      <el-row :gutter="12">
        <el-col :span="12">
          <el-form-item label="姓名" prop="name"><el-input v-model="form.name" placeholder="员工姓名" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="工号" prop="empNo">
            <el-input v-model="form.empNo" placeholder="留空则自动生成" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="性别">
            <el-radio-group v-model="form.gender">
              <el-radio value="male">男</el-radio>
              <el-radio value="female">女</el-radio>
              <el-radio value="unknown">未知</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="出生日期"><el-date-picker v-model="form.birthDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="部门" prop="departmentId">
            <el-tree-select v-model="form.departmentId" :data="deptTree" :render-after-expand="false"
              node-key="id" :props="{ label: 'name', children: 'children' }" check-strictly
              placeholder="请选择部门" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="职位" prop="positionId">
            <el-select v-model="form.positionId" placeholder="请选择职位" filterable style="width:100%">
              <el-option v-for="p in positions" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="入职日期" prop="hireDate">
            <el-date-picker v-model="form.hireDate" type="date" value-format="YYYY-MM-DD" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="员工状态">
            <el-select v-model="form.status" style="width:100%">
              <el-option label="试用期" value="probation" />
              <el-option label="正式" value="regular" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="手机号" prop="phone">
            <el-input v-model="form.phone" placeholder="11 位手机号" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="name@example.com" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="身份证号"><el-input v-model="form.idCard" placeholder="敏感信息，仅管理端可见" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="银行账号"><el-input v-model="form.bankAccount" placeholder="工资卡账号" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="基本工资" prop="baseSalary">
            <el-input-number v-model="form.baseSalary" :min="0" :precision="2" :step="500" style="width:100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="紧急联系人"><el-input v-model="form.emergencyContact" /></el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="紧急电话"><el-input v-model="form.emergencyPhone" /></el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="住址"><el-input v-model="form.address" /></el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '../../api';
import { useOptions } from '../../composables/useOptions';

const props = defineProps({
  modelValue: Boolean,
  employeeId: { type: Number, default: null },
});
const emit = defineEmits(['update:modelValue', 'saved']);

const { deptTree, positions, loadOptions } = useOptions();
const formRef = ref();
const loading = ref(false);
const saving = ref(false);

const blank = () => ({
  empNo: '', name: '', gender: 'male', birthDate: '', idCard: '', phone: '', email: '',
  emergencyContact: '', emergencyPhone: '', address: '', departmentId: null, positionId: null,
  hireDate: new Date().toISOString().slice(0, 10), status: 'probation', baseSalary: 8000, bankAccount: '',
});
const form = reactive(blank());

const isEdit = ref(false);

const rules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  departmentId: [{ required: true, message: '请选择部门', trigger: 'change' }],
  positionId: [{ required: true, message: '请选择职位', trigger: 'change' }],
  hireDate: [{ required: true, message: '请选择入职日期', trigger: 'change' }],
  baseSalary: [{ required: true, message: '请填写基本工资', trigger: 'blur' }],
  phone: [{ pattern: /^1\d{10}$/, message: '手机号格式不正确', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
};

watch(() => props.modelValue, async (open) => {
  if (!open) return;
  await loadOptions();
  Object.assign(form, blank());
  isEdit.value = !!props.employeeId;
  if (props.employeeId) {
    loading.value = true;
    try {
      const e = await api.get(`/api/employees/${props.employeeId}`, { silent: true });
      Object.assign(form, {
        empNo: e.emp_no, name: e.name, gender: e.gender, birthDate: e.birth_date,
        idCard: e.id_card || '', phone: e.phone || '', email: e.email || '',
        emergencyContact: e.emergency_contact || '', emergencyPhone: e.emergency_phone || '',
        address: e.address || '', departmentId: e.department_id, positionId: e.position_id,
        hireDate: e.hire_date, status: e.status === 'resigned' ? 'regular' : e.status,
        baseSalary: e.base_salary ?? 0, bankAccount: e.bank_account || '',
      });
    } finally { loading.value = false; }
  }
});

async function submit() {
  await formRef.value.validate().catch(() => { throw new Error('validate'); });
  saving.value = true;
  try {
    const payload = {
      empNo: form.empNo || undefined, name: form.name, gender: form.gender, birthDate: form.birthDate,
      idCard: form.idCard, phone: form.phone, email: form.email,
      emergencyContact: form.emergencyContact, emergencyPhone: form.emergencyPhone, address: form.address,
      departmentId: form.departmentId, positionId: form.positionId, hireDate: form.hireDate,
      status: form.status, baseSalary: form.baseSalary, bankAccount: form.bankAccount,
    };
    if (isEdit.value) await api.put(`/api/employees/${props.employeeId}`, payload);
    else await api.post('/api/employees', payload);
    ElMessage.success('保存成功');
    emit('update:modelValue', false);
    emit('saved');
  } finally { saving.value = false; }
}

function onClosed() { formRef.value?.resetFields(); }
</script>
