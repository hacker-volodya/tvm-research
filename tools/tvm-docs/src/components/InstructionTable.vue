<script setup lang="ts">
import { cp0 } from 'tvm-spec';
import VueMarkdown from 'vue-markdown-render'
</script>

<template>
  <div class="flex flex-col h-screen justify-between bg-gray-50 dark:bg-black-700">
    <main class="mb-auto mt-5 pb-10">
      <VaTabs v-model="value" :style="{ '--va-tabs-align-items-horizontal': 'left' }">
        <template #tabs>
          <VaTab v-for="tab in tabs" :key="tab" :name="tab">
            {{ tab }}
          </VaTab>
        </template>

        <section class="py-10">
          <div class="container mx-auto px-4 md:px-6">
            <VaDataTable :items="cp0.instructions.filter(insn => insn.doc.category == currentTab)" :columns="columns"
              clickable striped hoverable @row:click="({ row }) => row.toggleRowDetails()" :cell-bind="() => ({ 'class': 'text-wrap' })">
              <template #cell(doc.description)="{ value }">
                <vue-markdown :source="value"></vue-markdown>
              </template>
              <template #expandableRow="{ rowData }">
                <div class="text-sm px-4 md:px-8 py-8 bg-white dark:bg-black-600 text-wrap">
                  <div class="flex flex-col lg:flex-row">
                    <div>
                      <div>
                        <vue-markdown :source="rowData.doc.description" class="text-wrap"></vue-markdown>
                      </div>
                      <pre class="py-4 text-wrap">{{ JSON.stringify(rowData, undefined, 4) }}</pre>
                    </div>
                  </div>
                </div>
              </template>
            </VaDataTable>
          </div>
        </section>
      </VaTabs>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  components: {
    VueMarkdown
  },
  data() {
    const columns = [
      { key: "bytecode.doc_opcode", label: 'opcode' },
      { key: "mnemonic" },
      { key: "doc.description", label: 'description' },
    ];

    const categories = [...new Set(cp0.instructions.map(insn => insn.doc.category))];

    return {
      columns,
      tabs: categories,
      value: categories[0],
    };
  },
  computed: {
    currentTab() {
      return this.value;
    },
  },
});
</script>

<style>
.va-data-table__table-tr--expanded td {
  background: var(--va-background-border);
}

.va-data-table__table-expanded-content td {
  background-color: var(--va-background-element);
}
</style>
