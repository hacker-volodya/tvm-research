import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createVuestic } from "vuestic-ui";
import "vuestic-ui/css";

createApp(App).use(createVuestic()).mount('#app')
