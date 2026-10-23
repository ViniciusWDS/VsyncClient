package com.vsync.hud.mixin;
import com.vsync.hud.VsyncClient;
import net.minecraft.client.gui.hud.InGameHud;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
@Mixin(InGameHud.class) public class InGameHudMixin {
 @Inject(method="renderCrosshair",at=@At("HEAD"),cancellable=true) private void vsync$crosshair(DrawContext context,RenderTickCounter tickCounter,CallbackInfo ci){if(VsyncClient.config!=null&&VsyncClient.config.customCrosshair)ci.cancel();}
}
