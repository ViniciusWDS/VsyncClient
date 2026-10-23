package com.vsync.hud;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.loader.api.FabricLoader;
import java.nio.file.*;
import java.util.*;
public class HudConfig {
 public static class Element {
  public boolean enabled=true; public int x,y; public float scale=1f; public int color=0xFFF5F3FF; public int background=0xA0181820; public String alignment="left";
  public Element() {} public Element(int x,int y){this.x=x;this.y=y;}
 }
 public Map<String,Element> elements=new LinkedHashMap<>();
 public boolean toggleSprint=false,customCrosshair=false;
 public int crosshairColor=0xFFC4B5FD,crosshairSize=5,crosshairGap=3;
 public String preset="Survival";
 private static final Gson GSON=new GsonBuilder().setPrettyPrinting().create();
 private static final Path FILE=FabricLoader.getInstance().getConfigDir().resolve("vsync-hud.json");
 public HudConfig(){defaults("Survival");}
 public void defaults(String selected){
  elements.clear();String[] keys={"FPS","CPS","Teclas","Coordenadas","Armadura","Poções","Sessão"};
  for(int i=0;i<keys.length;i++)elements.put(keys[i],new Element(12,12+i*30));
  elements.get("Teclas").y=78;elements.get("Coordenadas").y=158;elements.get("Armadura").y=188;elements.get("Poções").y=218;elements.get("Sessão").y=280;
  if(selected.equals("PvP")){elements.get("Coordenadas").enabled=false;elements.get("Poções").enabled=false;elements.get("Armadura").y=158;elements.get("Sessão").y=188;}
  if(selected.equals("Minimalista")){for(var e:elements.entrySet())e.getValue().enabled=e.getKey().equals("FPS")||e.getKey().equals("Coordenadas");elements.get("Coordenadas").y=42;}
  preset=selected;
 }
 public static HudConfig load(){try{if(Files.exists(FILE)){HudConfig cfg=GSON.fromJson(Files.readString(FILE),HudConfig.class);HudConfig defaults=new HudConfig();defaults.elements.forEach(cfg.elements::putIfAbsent);return cfg;}}catch(Exception e){System.err.println("[Vsync] Falha ao ler preferências do HUD.");}return new HudConfig();}
 public void save(){try{Files.createDirectories(FILE.getParent());Path temp=FILE.resolveSibling("vsync-hud.tmp");Files.writeString(temp,GSON.toJson(this));Files.move(temp,FILE,StandardCopyOption.REPLACE_EXISTING);}catch(Exception e){System.err.println("[Vsync] Falha ao salvar preferências do HUD.");}}
}
