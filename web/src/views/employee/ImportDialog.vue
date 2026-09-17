<template>
  <el-dialog
    :model-value="modelValue"
    @update:model-value="(v) => emit('update:modelValue', v)"
    title="CSV 批量导入员工"
    width="640px"
  >
    <el-alert type="info" :closable="false" show-icon style="margin-bottom:14px">
      <template #title>
        首行须为表头，必需列：姓名、部门、职位、入职日期；可选列：工号、性别、手机号、邮箱、基本工资。
        部门/职位需已在系统中存在。全部行校验通过后才会入库。
      </template>
    </el-alert>

    <div class="upload-row">
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        accept=".csv,text/csv"
        :limit="1"
        :on-change="onFileChange"
        :on-exceed="onExceed"
      >
        <el-button type="primary" plain :icon="Upload">选择 CSV 文件</el-button>
        <template #tip><div class="upload-tip">仅支持 UTF-8 编码的 CSV，建议先下载模板</div></template>
      </el-upload>
      <el-button text type="primary" :icon="Download" @click="downloadTemplate">下载导入模板</el-button>
    </div>

    <div v-if="fileName" class="file-line">
      <el-icon color="#4361ee"><Document /></el-icon>
      <span class="file-name">{{ fileName }}</span>
      <el-button size="small" type="primary" :loading="importing" @click="doImport">开始导入</el-button>
    </div>

    <!-- 行级错误清单 -->
    <div v-if="errors.length" class="error-box">
      <div class="error-head">
        <el-icon color="#dc2626"><WarningFilled /></el-icon>
        <span>校验未通过，共 {{ errors.length }} 处错误（未导入任何数据）</span>
      </div>
      <el-table :data="errors" max-height="260" size="small" border>
        <el-table-column prop="row" label="表格行号" width="90" align="center">
          <template #default="{ row }"><b>第 {{ row.row }} 行</b></template>
        </el-table-column>
        <el-table-column prop="field" label="字段" width="110" />
        <el-table-column prop="message" label="问题说明" min-width="220" />
      </el-table>
    </div>

    <el-empty v-else-if="done" description="没有可展示的错误" :image-size="60" />
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Download, Document, WarningFilled } from '@element-plus/icons-vue';
import { api } from '../../api';

const props = defineProps({ modelValue: Boolean });
const emit = defineEmits(['update:modelValue', 'imported']);

const uploadRef = ref();
const fileContent = ref('');
const fileName = ref('');
const importing = ref(false);
const errors = ref([]);
const done = ref(false);

function onFileChange(file) {
  errors.value = [];
  done.value = false;
  fileName.value = file.name;
  const reader = new FileReader();
  reader.onload = () => { fileContent.value = String(reader.result || ''); };
  reader.onerror = () => ElMessage.error('文件读取失败');
  reader.readAsText(file.raw, 'utf-8');
}

function onExceed(files) {
  uploadRef.value.clearFiles();
  const f = files[0];
  uploadRef.value.handleStart(f);
}

async function doImport() {
  if (!fileContent.value) return ElMessage.warning('请先选择 CSV 文件');
  importing.value = true;
  errors.value = [];
  try {
    const r = await api.post('/api/employees/import', { content: fileContent.value }, { silent: true });
    ElMessage.success(r.message || '导入成功');
    emit('update:modelValue', false);
    emit('imported');
  } catch (e) {
    if (e.status === 400 && Array.isArray(e.detail)) {
      errors.value = e.detail;
    } else {
      ElMessage.error(e.message || '导入失败');
    }
  } finally {
    importing.value = false;
    done.value = true;
  }
}

function downloadTemplate() {
  const header = '工号,姓名,性别,部门,职位,手机号,邮箱,入职日期,基本工资';
  const sample = [
    'E101,刘明,男,技术中心,后端工程师,13800001111,liuming@example.com,2026-09-01,15000',
    'E102,陈晨,女,人力资源部,HR专员,13800002222,chenchen@example.com,2026-09-05,9000',
  ].join('\r\n');
  const blob = new Blob(['﻿' + header + '\r\n' + sample], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '员工导入模板.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
</script>

<style scoped>
.upload-row { display: flex; align-items: center; gap: 16px; }
.upload-tip { color: #94a3b8; font-size: 12px; margin-top: 4px; }
.file-line {
  margin-top: 14px; display: flex; align-items: center; gap: 10px;
  background: #f5f8ff; border: 1px solid #dbe6ff; border-radius: 10px; padding: 10px 14px;
}
.file-name { flex: 1; font-size: 13.5px; color: #334155; }
.error-box { margin-top: 16px; }
.error-head { display: flex; align-items: center; gap: 6px; color: #dc2626; font-size: 13.5px; margin-bottom: 8px; }
</style>
