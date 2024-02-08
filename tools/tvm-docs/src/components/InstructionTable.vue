<script setup lang="ts">
import { cp0 } from 'tvm-spec';
</script>

<template>
  <VaTabs v-model="value">
    <template #tabs>
      <VaTab v-for="tab in tabs" :key="tab" :name="tab">
        {{ tab }}
      </VaTab>
    </template>
    <div class="va-table-responsive">
          <table class="va-table va-table--clickable">
            <thead>
              <tr>
                <th>Mnemonic</th>
                <th>Prefix</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="insn in cp0.instructions.filter(insn => insn.doc.category == currentTab)" :key="insn.bytecode.prefix">
                <td>{{ insn.mnemonic }}</td>
                <td>{{ insn.bytecode.prefix }}</td>
                <td style="max-width: 80rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ insn.doc.description }}</td>
              </tr>
            </tbody>
          </table>
        </div>
  </VaTabs>
</template>

<script lang="ts">
const categories = [...new Set(cp0.instructions.map(insn => insn.doc.category))]

export default {
  data: () => ({
    tabs: categories,
    value: categories[0],
  }),

  computed: {
    currentTab() {
      return this.value;
    },
  },
};
</script>