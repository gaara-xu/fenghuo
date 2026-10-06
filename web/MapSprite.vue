<script lang="ts">
const sheets=new Map<string,Promise<HTMLImageElement>>()
function sheet(src:string){
  if(!sheets.has(src))sheets.set(src,new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{sheets.delete(src);reject(new Error('地图素材加载失败'))};image.src=src
  }))
  return sheets.get(src)!
}
</script>
<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount} from 'vue'
import {clearMapBackground} from './map-sprite'
const props=defineProps<{src:string;columns:number;frame:number}>(),canvas=ref<HTMLCanvasElement>()
let generation=0
async function paint(){
  const version=++generation
  try{
    const image=await sheet(props.src)
    if(version!==generation||!canvas.value)return
    const target=canvas.value,width=Math.round(image.naturalWidth/props.columns),height=image.naturalHeight
    target.width=width;target.height=height
    const context=target.getContext('2d');if(!context)return
    context.drawImage(image,props.frame*image.naturalWidth/props.columns,0,image.naturalWidth/props.columns,height,0,0,width,height)
    const pixels=context.getImageData(0,0,width,height)
    clearMapBackground(pixels.data,width,height);context.putImageData(pixels,0,0)
  }catch{ /* 加载失败不绘制白底替代图；目标名称与出征操作仍可用。 */ }
}
onMounted(paint);watch(()=>[props.src,props.columns,props.frame],paint);onBeforeUnmount(()=>generation++)
</script>
<template><canvas ref="canvas" aria-hidden="true"/></template>
