package com.alastor.superflatforge

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject

data class Layer(val block: String, val count: Int)

class MainActivity : ComponentActivity() {
 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState)
  setContent { MaterialTheme(colorScheme = darkColorScheme()) { ForgeScreen() } }
 }
}

@Composable fun ForgeScreen() {
 var name by remember { mutableStateOf("My Superflat World") }
 var seed by remember { mutableStateOf("") }
 var biome by remember { mutableStateOf("plains") }
 var noSlimes by remember { mutableStateOf(false) }
 val layers = remember { mutableStateListOf(Layer("minecraft:bedrock",1),Layer("minecraft:dirt",2),Layer("minecraft:grass_block",1)) }
 var pending by remember { mutableStateOf("") }
 val context = androidx.compose.ui.platform.LocalContext.current
 val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
  if (uri != null) try { context.contentResolver.openOutputStream(uri)?.use { it.write(pending.toByteArray(Charsets.UTF_8)) } } catch (_: Exception) {}
 }
 Column(Modifier.fillMaxSize().padding(16.dp)) {
  Text("SUPERFLAT FORGE", style = MaterialTheme.typography.headlineMedium)
  Text("Native Bedrock layer designer", color = MaterialTheme.colorScheme.primary)
  Spacer(Modifier.height(12.dp))
  LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.weight(1f)) {
   item { OutlinedTextField(name,{name=it},label={Text("World name")},modifier=Modifier.fillMaxWidth()) }
   item { OutlinedTextField(seed,{seed=it},label={Text("Seed (optional)")},modifier=Modifier.fillMaxWidth()) }
   item { OutlinedTextField(biome,{biome=it},label={Text("Biome ID")},modifier=Modifier.fillMaxWidth()) }
   item { Row(verticalAlignment=androidx.compose.ui.Alignment.CenterVertically) { Text("Prevent slimes (export metadata only)",modifier=Modifier.weight(1f)); Switch(noSlimes,{noSlimes=it}) } }
   item { Text("Layers · bottom to top",style=MaterialTheme.typography.titleLarge) }
   itemsIndexed(layers) { index, layer ->
    Card { Column(Modifier.fillMaxWidth().padding(12.dp)) {
     OutlinedTextField(layer.block,{layers[index]=layer.copy(block=it)},label={Text("Block ID")},modifier=Modifier.fillMaxWidth())
     Row(horizontalArrangement=Arrangement.spacedBy(6.dp),verticalAlignment=androidx.compose.ui.Alignment.CenterVertically) {
      OutlinedTextField(layer.count.toString(),{ it.toIntOrNull()?.takeIf { n -> n in 1..384 }?.let { n -> layers[index]=layer.copy(count=n) } },label={Text("Height")},keyboardOptions=KeyboardOptions(keyboardType=KeyboardType.Number),modifier=Modifier.weight(1f))
      TextButton(onClick={if(index>0){val a=layers[index-1];layers[index-1]=layer;layers[index]=a}},enabled=index>0){Text("↑")}
      TextButton(onClick={if(index<layers.lastIndex){val a=layers[index+1];layers[index+1]=layer;layers[index]=a}},enabled=index<layers.lastIndex){Text("↓")}
      TextButton(onClick={layers.removeAt(index)},enabled=layers.size>1){Text("✕")}
     }
    } }
   }
   item { Button(onClick={layers.add(Layer("minecraft:stone",1))},modifier=Modifier.fillMaxWidth()){Text("+ Add layer") } }
   item { Text("Total height: ${layers.sumOf { it.count }} blocks") }
   item { Text("Layer preview",style=MaterialTheme.typography.titleMedium)
    Column(Modifier.fillMaxWidth().border(1.dp,MaterialTheme.colorScheme.outline,RoundedCornerShape(8.dp))) {
     layers.reversed().forEach { layer ->
      Surface(color=MaterialTheme.colorScheme.surfaceVariant,modifier=Modifier.fillMaxWidth().padding(2.dp)) { Text("${layer.block}  × ${layer.count}",Modifier.padding(10.dp)) }
     }
    }
   }
   item { OutlinedButton(onClick={ layers.clear();layers.addAll(listOf(Layer("minecraft:bedrock",1),Layer("minecraft:dirt",2),Layer("minecraft:grass_block",1)));biome="plains" },modifier=Modifier.fillMaxWidth()){Text("Classic preset") } }
   item { OutlinedButton(onClick={layers.clear();layers.add(Layer("minecraft:air",1));biome="the_void"},modifier=Modifier.fillMaxWidth()){Text("Void preset") } }
   item { OutlinedButton(onClick={layers.clear();layers.addAll(listOf(Layer("minecraft:bedrock",1),Layer("minecraft:gravel",5),Layer("minecraft:water",64)));biome="ocean"},modifier=Modifier.fillMaxWidth()){Text("Ocean preset") } }
  }
  Button(onClick={
   val arr=JSONArray();layers.forEach { arr.put(JSONObject().put("block",it.block).put("count",it.count)) }
   pending=JSONObject().put("worldName",name).put("seed",seed).put("biome",biome).put("preventSlimes",noSlimes).put("layers",arr).toString(2)
   save.launch("${name.replace(Regex("[^a-zA-Z0-9_-]"),"_")}.json")
  },modifier=Modifier.fillMaxWidth(),enabled=layers.isNotEmpty()&&layers.sumOf { it.count }<=384){Text("Export configuration JSON")}
 }
}