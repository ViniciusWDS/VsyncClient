package com.vsync.hud;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.text.Text;
import java.util.*;
public class HudScreen extends Screen {
 private final boolean editor;private String selected="FPS",dragging=null;private double offsetX,offsetY;
 public HudScreen(boolean editor){super(Text.literal(editor?"Vsync • Editor de HUD":"Vsync Client"));this.editor=editor;}
 @Override protected void init(){
  int x=width/2-150,y=height/2-130;
  if(editor){
   addDrawableChild(ButtonWidget.builder(Text.literal("Concluir"),b->close()).dimensions(width-110,10,100,20).build());
   addDrawableChild(ButtonWidget.builder(Text.literal("Escala +"),b->{element().scale=Math.min(3,element().scale+.1f);}).dimensions(width-110,40,100,20).build());
   addDrawableChild(ButtonWidget.builder(Text.literal("Escala -"),b->{element().scale=Math.max(.5f,element().scale-.1f);}).dimensions(width-110,64,100,20).build());
   addDrawableChild(ButtonWidget.builder(Text.literal("Cor"),b->{int[] colors={0xFFF5F3FF,0xFFC4B5FD,0xFF4ADE80,0xFFFBBF24};int i=0;for(int j=0;j<colors.length;j++)if(element().color==colors[j])i=j;element().color=colors[(i+1)%colors.length];}).dimensions(width-110,88,100,20).build());
   addDrawableChild(ButtonWidget.builder(Text.literal("Transparência"),b->{int alpha=(element().background>>>24);alpha=alpha<=32?224:alpha-32;element().background=(alpha<<24)|0x181820;}).dimensions(width-110,112,100,20).build());
   addDrawableChild(ButtonWidget.builder(Text.literal("Alinhamento"),b->{var e=element();var values=List.of("left","center","right");e.alignment=values.get((values.indexOf(e.alignment)+1)%3);e.x=12;}).dimensions(width-110,136,100,20).build());
   return;
  }
  addDrawableChild(ButtonWidget.builder(Text.literal("Editar HUD • arraste os elementos"),b->client.setScreen(new HudScreen(true))).dimensions(x,y+28,300,20).build());
  int row=0;for(String key:VsyncClient.config.elements.keySet()){
   var e=VsyncClient.config.elements.get(key);int buttonY=y+56+row*24;
   addDrawableChild(ButtonWidget.builder(Text.literal(key+": "+(e.enabled?"ligado":"desligado")),b->{e.enabled=!e.enabled;b.setMessage(Text.literal(key+": "+(e.enabled?"ligado":"desligado")));}).dimensions(x,buttonY,145,20).build());row++;
  }
  int right=x+155;
  addDrawableChild(ButtonWidget.builder(Text.literal("Preset: "+VsyncClient.config.preset),b->{var p=List.of("PvP","Survival","Minimalista");int i=p.indexOf(VsyncClient.config.preset);VsyncClient.config.defaults(p.get((i+1)%p.size()));clearAndInit();}).dimensions(right,y+56,145,20).build());
  addDrawableChild(ButtonWidget.builder(Text.literal("Crosshair: "+(VsyncClient.config.customCrosshair?"Vsync":"padrão")),b->{VsyncClient.config.customCrosshair=!VsyncClient.config.customCrosshair;clearAndInit();}).dimensions(right,y+80,145,20).build());
  addDrawableChild(ButtonWidget.builder(Text.literal("Mira: tamanho +"),b->{VsyncClient.config.crosshairSize=VsyncClient.config.crosshairSize>=12?2:VsyncClient.config.crosshairSize+1;}).dimensions(right,y+104,145,20).build());
  addDrawableChild(ButtonWidget.builder(Text.literal("Mira: espaço +"),b->{VsyncClient.config.crosshairGap=(VsyncClient.config.crosshairGap+1)%9;}).dimensions(right,y+128,145,20).build());
  addDrawableChild(ButtonWidget.builder(Text.literal("Mira: cor"),b->{VsyncClient.config.crosshairColor=VsyncClient.config.crosshairColor==0xFFC4B5FD?0xFF4ADE80:0xFFC4B5FD;}).dimensions(right,y+152,145,20).build());
  addDrawableChild(ButtonWidget.builder(Text.literal("Concluir"),b->close()).dimensions(right,y+200,145,20).build());
 }
 private HudConfig.Element element(){return VsyncClient.config.elements.get(selected);}
 @Override public void render(DrawContext ctx,int mouseX,int mouseY,float delta){
  if(editor){VsyncClient.drawHud(ctx,true);for(var b:VsyncClient.bounds.entrySet()){int[] r=b.getValue();int c=b.getKey().equals(selected)?0xFFC4B5FD:0x998B5CF6;ctx.drawBorder(r[0]-1,r[1]-1,r[2]+2,r[3]+2,c);}ctx.drawTextWithShadow(textRenderer,Text.literal("Arraste • selecionado: "+selected),10,height-18,0xFFC4B5FD);}
  else{ctx.fill(0,0,width,height,0xCE09090D);ctx.fill(width/2-163,height/2-145,width/2+163,height/2+132,0xF0181820);ctx.drawCenteredTextWithShadow(textRenderer,title,width/2,height/2-128,0xFFC4B5FD);}
  super.render(ctx,mouseX,mouseY,delta);
 }
 @Override public boolean mouseClicked(double x,double y,int button){
  if(super.mouseClicked(x,y,button))return true;
  if(editor&&button==0){for(var entry:VsyncClient.bounds.entrySet()){int[] r=entry.getValue();if(x>=r[0]&&x<=r[0]+r[2]&&y>=r[1]&&y<=r[1]+r[3]){selected=dragging=entry.getKey();element().alignment="left";element().x=r[0];element().y=r[1];offsetX=x-r[0];offsetY=y-r[1];return true;}}}return false;
 }
 @Override public boolean mouseDragged(double x,double y,int button,double dx,double dy){if(dragging!=null){element().x=(int)Math.max(0,Math.min(width-20,x-offsetX));element().y=(int)Math.max(0,Math.min(height-20,y-offsetY));return true;}return super.mouseDragged(x,y,button,dx,dy);}
 @Override public boolean mouseReleased(double x,double y,int button){dragging=null;VsyncClient.config.save();return super.mouseReleased(x,y,button);}
 @Override public void close(){VsyncClient.config.save();super.close();}
 @Override public boolean shouldPause(){return false;}
}
