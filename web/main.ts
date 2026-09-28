import { createApp,h } from 'vue'
import GameHints from './GameHints.vue'
import {installGameValidation} from './game-validation'
import GameDialogs from './GameDialogs.vue'
import {isAdminPath} from '../shared/app-context'
import './style.css'
import './world.css'
import './defense.css'
import './art.css'
import './cultivation.css'
import './map-redesign.css'
import './inventory.css'
import './admin.css'
import './military.css'
import './game-controls.css'
import './game-dialog.css'

const entry=isAdminPath(window.location.pathname)?import('./AdminApp.vue'):import('./App.vue')
document.addEventListener('contextmenu',event=>{if(event.target instanceof Element&&event.target.closest('#app,.war-modal-shade,.choice-shade,.bag-tooltip'))event.preventDefault()})
installGameValidation()
void entry.then(({default:App})=>createApp({render:()=>[h(App),h(GameDialogs),h(GameHints)]}).mount('#app'))
