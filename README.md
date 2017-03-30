# VRPlayer
VR play for image and video<br>
supported **AMD** loaded

## preview

[Video](https://wangcylive.github.io/VRPlayer/src/video.html)<br>
[Image](https://wangcylive.github.io/VRPlayer/src/image.html)

## video
###usage
```javascript
var vr = videoJs(element, config);
```
###config
```javascript
config = {
	src: "",     // media resource
	poster: "",  // media poster
	ratio: 2/3,  // media height width ratio
	vr: boolean  // default true, if false play the original video
	autoplay: Boolean  // default false
}
```

###propetry
```javascript
// if vr has this property
vr.supportOrientation

vr.supportWebGL

vr.supportVR

vr.fov

vr.isOrientation

vr.isVR

vr.isVRView
```

###method
```javascript
// if vr has this method
vr.requestStereo()

vr.exitStereo()

vr.changeOrientation();

vr.resize();
// end if

// change fullscreen
vr.fullscreen();

// change video src
vr.setSrc();
```

## image
###usage
```javascript
var vr = imageVR(element, config);
```

###config
```javascript
config = {
	src: "",     // image resource
	ratio: 2/3   // if is a number set element padding-top
}
```

###propetry
```javascript
// if vr has this property
vr.supportOrientation

vr.supportWebGL

vr.supportVR

vr.fov

vr.isOrientation

vr.isVRView
```

###method
```javascript
vr.requestStereo()

vr.exitStereo()

vr.changeOrientation();

vr.resize();

vr.fullscreen();

// change image src
vr.setSrc(imageSrc);
```