# VRPlayer
VR play for image and video<br>
supported **AMD** loaded

## video
###usage
```javascript
var videoObj = videoJs(element, config);
```
###config
```javascript
config = {
	src: "",     // media resource
	poster: "",  // media poster
	ratio: 2/3,  // media height width ratio
	vr: boolean  // default true, if false play the original video
}
```

###propetry
```javascript
// if vr has this property
videoObj.supportOrientation

videoObj.supportWebGL

videoObj.supportVR

videoObj.fov

videoObj.isOrientation

videoObj.isVR

videoObj.isVRView
```

###method
```javascript
// if vr has this method
videoObj.requestStereo()

videoObj.exitStereo()

videoObj.changeOrientation();

videoObj.resize();
// end if


videoObj.play();

videoObj.pause();

videoObj.seek(second);

videoObj.seekTo(second);

videoObj.mute(is);

// number 0 to 1
videoObj.volume(number);

// change fullscreen
videoObj.fullscreen();

// event bind
videoOjb.on(events, handler);
```

## image
###usage
```javascript
var imageObj = imageVR(element, config);
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
imageObj.supportOrientation

imageObj.supportWebGL

imageObj.supportVR

imageObj.fov

imageObj.isOrientation

imageObj.isVRView
```

###method
```javascript
imageObj.requestStereo()

imageObj.exitStereo()

imageObj.changeOrientation();

imageObj.resize();

imageObj.fullscreen();

imageObj.on(events, handler);
```