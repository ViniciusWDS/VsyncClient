package com.vsync.hud;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.text.Text;
import org.lwjgl.glfw.GLFW;
import java.util.*;
public class VsyncClient implements ClientModInitializer {
 public static HudConfig config;
 public static KeyBinding menuKey,zoomKey,sprintKey;
 public static boolean sprintEnabled=false;
 public static final Deque<Long> leftClicks=new ArrayDeque<>(),rightClicks=new ArrayDeque<>();
 public static long sessionStarted=System.currentTimeMillis();
 public static final Map<String,int[]> bounds=new LinkedHashMap<>();
 @Override public void onInitializeClient(){
  config=HudConfig.load();
  menuKey=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.vsync.menu",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_RIGHT_SHIFT,"category.vsync"));
  zoomKey=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.vsync.zoom",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_C,"category.vsync"));
  sprintKey=KeyBindingHelper.registerKeyBinding(new KeyBinding("key.vsync.sprint",InputUtil.Type.KEYSYM,GLFW.GLFW_KEY_R,"category.vsync"));
  ClientTickEvents.END_CLIENT_TICK.register(client->{
   while(menuKey.wasPressed())if(client.currentScreen==null)client.setScreen(new HudScreen(false));
   while(sprintKey.wasPressed()){sprintEnabled=!sprintEnabled;config.toggleSprint=sprintEnabled;config.save();}
   if(client.player!=null&&client.currentScreen==null&&sprintEnabled&&client.options.forwardKey.isPressed()&&!client.player.isSneaking())client.player.setSprinting(true);
   trim(leftClicks);trim(rightClicks);
  });
  sprintEnabled=config.toggleSprint;
  HudRenderCallback.EVENT.register((context,tickCounter)->{if(MinecraftClient.getInstance().currentScreen instanceof HudScreen)return;drawHud(context,false);});
 }
 private static void trim(Deque<Long> q){long cutoff=System.currentTimeMillis()-1000;while(!q.isEmpty()&&q.peekFirst()<cutoff)q.removeFirst();}
 public static void click(int button){if(MinecraftClient.getInstance().currentScreen!=null)return;if(button==0)leftClicks.addLast(System.currentTimeMillis());if(button==1)rightClicks.addLast(System.currentTimeMillis());}
 public static boolean zooming(){return zoomKey!=null&&zoomKey.isPressed()&&MinecraftClient.getInstance().currentScreen==null;}
 public static void drawHud(DrawContext ctx,boolean editor){
  MinecraftClient mc=MinecraftClient.getInstance();if(!editor&&(mc.player==null||mc.options.hudHidden))return;
  var lines=new LinkedHashMap<String,List<String>>();
  lines.put("FPS",List.of(mc.getCurrentFps()+" FPS"));
  lines.put("CPS",List.of(leftClicks.size()+" | "+rightClicks.size()+" CPS"));
  lines.put("Teclas",List.of((mc.options.forwardKey.isPressed()?"[ W ]":"  W  "),(mc.options.leftKey.isPressed()?"[A]":" A ")+" "+(mc.options.backKey.isPressed()?"[S]":" S ")+" "+(mc.options.rightKey.isPressed()?"[D]":" D "),sprintEnabled?"Sprint: ligado":"Sprint: desligado"));
  lines.put("Coordenadas",List.of(mc.player==null?"XYZ 0 / 64 / 0":String.format("XYZ %d / %d / %d",mc.player.getBlockX(),mc.player.getBlockY(),mc.player.getBlockZ())));
  List<String> armor=new ArrayList<>();if(mc.player!=null)for(var item:mc.player.getArmorItems())if(!item.isEmpty())armor.add(item.getName().getString()+" "+(item.getMaxDamage()-item.getDamage())+"/"+item.getMaxDamage());
  if(armor.isEmpty())armor.add("Armadura: "+(editor?"prévia":"sem equipamento"));lines.put("Armadura",armor);
  List<String> effects=new ArrayList<>();if(mc.player!=null)for(StatusEffectInstance e:mc.player.getStatusEffects())effects.add(e.getEffectType().value().getName().getString()+" "+(e.getAmplifier()+1)+" • "+(e.getDuration()/20)+"s");
  if(effects.isEmpty())effects.add("Poções: "+(editor?"prévia":"sem efeitos"));lines.put("Poções",effects);
  long sec=(System.currentTimeMillis()-sessionStarted)/1000;lines.put("Sessão",List.of(String.format("Sessão %02d:%02d",sec/60,sec%60)));
  bounds.clear();
  for(var item:lines.entrySet()){
   HudConfig.Element e=config.elements.get(item.getKey());if(e==null||!e.enabled)continue;
   int width=item.getValue().stream().mapToInt(mc.textRenderer::getWidth).max().orElse(40)+12,height=item.getValue().size()*12+8;
   e.scale=Math.max(.5f,Math.min(3f,e.scale));int scaledWidth=(int)(width*e.scale),scaledHeight=(int)(height*e.scale);
   int x=e.alignment.equals("right")?ctx.getScaledWindowWidth()-e.x-scaledWidth:e.alignment.equals("center")?(ctx.getScaledWindowWidth()-scaledWidth)/2+e.x:e.x;
   x=Math.max(0,Math.min(ctx.getScaledWindowWidth()-scaledWidth,x));int y=Math.max(0,Math.min(ctx.getScaledWindowHeight()-scaledHeight,e.y));
   bounds.put(item.getKey(),new int[]{x,y,scaledWidth,scaledHeight});
   ctx.getMatrices().push();ctx.getMatrices().translate(x,y,0);ctx.getMatrices().scale(e.scale,e.scale,1);ctx.fill(0,0,width,height,e.background);int row=5;
   for(String text:item.getValue()){ctx.drawTextWithShadow(mc.textRenderer,text,6,row,e.color);row+=12;}ctx.getMatrices().pop();
  }
  if(config.customCrosshair&&!editor&&mc.player!=null&&!mc.options.hudHidden){int cx=ctx.getScaledWindowWidth()/2,cy=ctx.getScaledWindowHeight()/2,g=config.crosshairGap,s=config.crosshairSize,c=config.crosshairColor;ctx.fill(cx-g-s,cy,cx-g,cy+1,c);ctx.fill(cx+g,cy,cx+g+s,cy+1,c);ctx.fill(cx,cy-g-s,cx+1,cy-g,c);ctx.fill(cx,cy+g,cx+1,cy+g+s,c);}
 }
}
