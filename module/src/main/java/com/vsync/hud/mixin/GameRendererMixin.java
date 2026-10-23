package com.vsync.hud.mixin;
import com.vsync.hud.VsyncClient;
import net.minecraft.client.render.GameRenderer;
import net.minecraft.client.render.Camera;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
@Mixin(GameRenderer.class) public class GameRendererMixin {
 @Inject(method="getFov",at=@At("RETURN"),cancellable=true) private void vsync$zoom(Camera camera,float tickDelta,boolean changingFov,CallbackInfoReturnable<Double> cir){if(VsyncClient.zooming())cir.setReturnValue(cir.getReturnValue()/4.0);}
}
