/**
 * Created by wangchunyang on 16/7/29.
 * Bugs
 * UC Android 浏览器改变 canvas 大小导致模型图片材质失效,需要在改变大小后设置 texture.needUpdate = true
 * 华为手机系统浏览器显示效果太差
 * HTC 5.0 默认浏览器调用全屏没有作用; 不能同时绑定两个 deviceorientation 事件, 载入就开始检测是否支持陀螺仪
 * IOS 浏览器不支持全屏
 */

;(function(jQuery) {
    var $ = jQuery(),
        root = window,
        doc = document,
        body = doc.body,
        $root = $(root),
        $doc = $(doc),
        $body = $(body);

    var MESSAGES = [
        "您的浏览器不支持全景图片",
        "您的浏览器不支持陀螺仪",
        "您的浏览器不支持全屏",
        "图片加载失败"
    ];

    var RADIUS = 100,      // VR视角球体半径
        DEFAULT_FOV = 75,  // 初始 camera 视角
        MIN_FOV = 30,      // camera 视角最大值
        MAX_FOV = 120;     // camera 视角最小值

    var supportOrientation = 1;  // 是否支持陀螺仪,加载后检测是否支持

    var btnActiveClassName = "active";

    var browser = (function () {
        var u = navigator.userAgent;

        return {
            mobile: /Mobile|Android|Symbian/i.test(u),
            android: /Android|Adr/i.test(u),
            ios: /iPhone|iPad|iPod/i.test(u),
            symbian: /Symbian/i.test(u),
            windowsPhone: /Windows Phone/i.test(u),
            blankBerry: /BB/i.test(u),
            weChat: /MicroMessenger/i.test(u),
            qq: /MQQBrowser/i.test(u),
            uc: /UCBrowser/i.test(u),
            chrome: /Chrome\/[\d\.]+ Mobile Safari\/[\d\.]+$/i.test(u),
            firefox: /Firefox/i.test(u)
        }
    }());

    var supportWebGL = (function() {
        var canvas = doc.createElement("canvas"),
            contextNames = ["webgl", "experimental-webgl"];

        var context;

        for(var i = 0; i < contextNames.length; i++) {
            try {
                context = canvas.getContext(contextNames[i]);

                if(context) {
                    break;
                }
            } catch (e) {}
        }

        return !!context;
    }());

    var supportVR = supportWebGL;

    root.requestAnimationFrame = root.requestAnimationFrame || root.mozRequestAnimationFrame ||
        root.webkitRequestAnimationFrame || root.msRequestAnimationFrame;
    root.cancelAnimationFrame = root.cancelAnimationFrame || root.mozCancelAnimationFrame;

    $.createElem = function (nodeName, className) {
        if (typeof nodeName === "string" && (nodeName = $.trim(nodeName))) {
            var elem = doc.createElement(nodeName);
            if (typeof className === "string" && (className = $.trim(className))) {
                elem.className = className;
            }
            return $(elem);
        }
    };

    var getCssPrefix = (function () {
        var prx = ["", "-webkit-", "-moz-", "-ms-", "-o-"],
            div = doc.createElement("div"),
            style = div.style,
            value;

        return function (property) {
            property = hyphenCase(property);

            for (var i = 0, length = prx.length; i < length; i++) {
                value = "";

                if (!prx[i]) {
                    value = property;
                } else {
                    value = prx[i] + property;
                }

                if (value in style) {
                    return value;
                }
            }
        }
    }());

    var supportAnimationEvent = (function () {
        return !!(typeof AnimationEvent !== "undefined" || typeof WebKitAnimationEvent !== "undefined");
    }());

    function getAnimationEvent(type) {
        if (/^Animation(Start|Iteration|End)$/.test(type)) {
            if (typeof AnimationEvent !== "undefined") {
                return type.toLowerCase();
            } else if (typeof WebKitAnimationEvent !== "undefined") {
                return "webkit" + type;
            }
        }
    }

    // 是否支持Transition事件
    var supportTranstionEvent = (function () {
        return !!(typeof TransitionEvent !== "undefined" || typeof WebKitTransitionEvent !== "undefined");
    }());

    // 获取TransitionEnd事件名称
    function getTransitionEndEvent() {
        if (typeof TransitionEvent !== "undefined") {
            return "transitionend";
        } else if (typeof WebKitTransitionEvent !== "undefined") {
            return "webkitTransitionEnd";
        }
    }

    // 是否支持Touch事件
    var supportTouch = (function () {
        var is = false;
        try {
            var type = doc.createEvent("TouchEvent");
            type.initEvent("touchstart");
            is = true;
        } catch (e) {
        }
        return is;
    }());

    // 支持陀螺仪检测
    $root.one("deviceorientation", function (event) {
        supportOrientation = null !== event.alpha;
        imageVR.fn.supportOrientation = supportOrientation;
        imageVR.fn.testedOrientation = true;

        if("function" === typeof imageVR.deviceorientation) {
            imageVR.deviceorientation(supportOrientation);
        }
    });

    function hyphenCase(propertyName) {
        function format(match) {
            return "-" + match.toLowerCase();
        }

        if (propertyName.indexOf("-") !== -1) {
            return propertyName.toLowerCase();
        } else {
            return propertyName.replace(/^[A-Z]/, function (match) {
                return match.toLowerCase();
            }).replace(/^(webkit|moz|ms|o)/i, function (match) {
                return "-" + match;
            }).replace(/[A-Z]/g, format);
        }
    }

    function camelCase(propertyName) {
        function format(match) {
            return match.charAt(1).toUpperCase();
        }

        return propertyName.replace(/^-/, "").replace(/-[a-zA-Z]/g, format);
    }

    // 全屏功能
    var fullscreen = (function() {
        var h = doc.documentElement,
            requestFullscreen = h.requestFullscreen || h.webkitRequestFullScreen || h.mozRequestFullScreen ||
                h.msRequestFullscreen,
            fullscreenEnabled = doc.fullscreenEnabled || doc.webkitFullscreenEnabled || doc.mozFullScreenEnabled ||
                doc.msFullscreenEnabled || true,
            exitFullscreen = doc.exitFullscroll || doc.webkitCancelFullScreen || doc.mozCancelFullScreen ||
                doc.msExitFullscreen;

        var fullscreenchangeEvents = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"],
            fullscreenElementNames = ["fullscreenElement", "webkitFullscreenElement", "webkitCurrentFullScreenElement",
                "mozFullScreenElement", "msFullscreenElement"];

        var fullscreenchange, fullscreenElement;

        fullscreenchangeEvents.some(function(item) {
            if("on" + item in doc) {
                return fullscreenchange = item;
            }
        });

        fullscreenElementNames.some(function(item) {
            if(item in doc) {
                return fullscreenElement = item;
            }
        });

        var _changeEventsList = [];

        // 绑定全屏改变事件
        function on(callback) {
            if(fullscreenchange && "function" === typeof callback) {
                doc.addEventListener(fullscreenchange, callback, false);
                _changeEventsList.push(callback);
            }
        }

        // 清除全屏改变事件
        function off() {
            _changeEventsList.forEach(function(item) {
                doc.removeEventListener(fullscreenchange, item, false);
            })
        }

        // 全屏 document.documentElement
        function request() {
            if(fullscreenEnabled) {
                if("function" === typeof requestFullscreen) {
                    requestFullscreen.call(h);
                }
            } else {
                console.info("unable fullscreen");
            }
        }

        // 退出全屏
        function exit() {
            if("function" === typeof exitFullscreen) {
                exitFullscreen.call(doc);
            }
        }

        return {
            on: on,
            off: off,
            request: request,
            exit: exit,
            fullscreenElement: fullscreenElement
        }
    }());

    var transition = getCssPrefix("transition"),
        transform = getCssPrefix("transform"),
        transitionEnd = getTransitionEndEvent();

    function imageVR(elem, src) {
        return new imageVR.fn.init(elem, src);
    }

    imageVR.fn = imageVR.prototype = {
        version: "1.1.0",
        constructor: imageVR,
        fullscreen: function () {
            if (this.main) {
                var $main = $(this.main),
                    className = "is-fullscreen";

                if ($main.hasClass(className)) {
                    fullscreen.exit();
                    $body.removeClass("vr-full");
                    $main.removeClass(className);
                } else {
                    fullscreen.request();
                    $body.removeClass("vr-full");
                    $main.addClass(className);
                }
            }
            return this;
        },
        on: function (events, handler) {
            var image = this.image;
            if (image && typeof events === "string" && (events = $.trim(events)) && typeof handler === "function") {

                $(image).on(events, handler);
            }
            return this;
        },
        toast: (function () {
            var elem = doc.getElementById("toast"),
                duration = 4000,
                isVisible = 0,
                identity;

            if (elem === null) {
                elem = doc.createElement("div");
                elem.id = "toast";
                elem.className = "toast";
                elem.style.display = "none";
                body.appendChild(elem);
            }

            var style = elem.style;

            function show(text) {
                elem.textContent = text;
                style.display = "block";
                isVisible = 1;
                clearTimeout(identity);
                identity = setTimeout(function () {
                    style.display = "none";
                    isVisible = 0;
                }, duration);

                return identity;
            }

            function hide() {
                if (isVisible) {
                    clearTimeout(identity);
                    style.display = "none";
                    isVisible = 0;
                }
            }

            doc.addEventListener("click", hide, true);
            doc.addEventListener("touchend", hide, true);

            return show;
        }()),
        supportWebGL: supportWebGL,
        supportVR: supportVR,
        supportOrientation: supportOrientation
    };

    imageVR.fn.init = function(elem, conf) {
        if(!elem || elem.nodeType !== 1) {
            throw new TypeError("Failed to 'imageVR' arguments, 1 argument must be 'Element'");
        }

        if(!conf || "string" !== typeof conf.src) {
            throw new TypeError("Failed to 'imageVR' arguments, 2 argument must be 'Object' and attribute 'src' must be 'String'");
        }

        var config = {
            ratio: 272 / 480
        };

        // 默认配置设置
        (function () {
            var x;
            for (x in conf) {
                if (conf.hasOwnProperty(x)) {
                    config[x] = conf[x];
                }
            }
        }());

        var _vr = this;

        var $main = $(elem),
            $ratio = $.createElem("div", "ratio-vr"),
            $ui = $.createElem("div", "ul-vr"),
            $exitVR = $.createElem("div", "exit-vr"),
            $controls = $.createElem("div", "controls-vr"),
            $stereoEffect = $.createElem("button", "stereo"),
            $fullscreen = $.createElem("button", "fullscreen"),
            $orientation = $.createElem("button", "orientation");

        $main.append($ratio);

        $main.addClass("image-vr");

        if(!isNaN(config.ratio)) {
            $ratio.css("padding-top", config.ratio * 100 + "%");
        }

        $exitVR.text("退出VR视角");

        /**
         * start VR variable
         */
        var renderer, scene, camera, normalEffect, stereoEffect, stats;

        var mesh, sphere, material, texture;

        var domElement;

        var orientationControls;

        var vrRequestID;

        // 滑动控制
        var vr_isDrag = 0,
            vr_lon = 0,
            vr_lat = 0,
            vr_endX = 0,
            vr_endY = 0,
            vr_startX = 0,
            vr_startY = 0,
            vr_moveX = 0,
            vr_moveY = 0;

        var moveTouchIdentifier,  // 记录滑动 Touch identifier
            scaleStartDistance,   // 记录滑动缩放开始两点记录
            scaleStartFov;        // 记录滑动缩放开始 camera fov

        // 控制点击播放暂停和VR拖动控制事件冲突,有拖动值为 true
        var vr_isMove = false;

        // 退出VR视图按钮控制
        var hideExitVRTimeoutID,
            hideExitVRTransitionState;

        // 视图大小
        var vr_clientWidth = elem.clientWidth,
            vr_clientHeight = elem.clientHeight;
        /**
         * end VR variable
         */


        /**
         * VR 控制功能函数
         */
        function vrMouseWheel(event) {
            if (event.wheelDeltaY) {  // WebKit
                _vr.fov -= event.wheelDeltaY * 0.05;
            } else if (event.wheelDelta) {  // Opera / Explorer 9
                _vr.fov -= event.wheelDelta * 0.05;
            } else if (event.detail) {  // Firefox
                _vr.fov += event.detail * 1.0;
            }

            _vr.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, _vr.fov));

            camera.fov = _vr.fov;
            camera.updateProjectionMatrix();
        }

        function vrResize() {
            camera.aspect = elem.clientWidth / elem.clientHeight;
            camera.updateProjectionMatrix();

            renderer.setSize(elem.clientWidth, elem.clientHeight);

            if(browser.mobile && browser.uc) {
                texture.needsUpdate = true;
            }

            renderer.render(scene, camera);

            return _vr;
        }

        function vrTouchStart(event) {
            vr_isMove = 0;

            vr_clientWidth = elem.clientWidth;
            vr_clientHeight = elem.clientHeight;

            var touches = event.targetTouches,
                touch = touches[0];

            if (1 === touches.length && undefined === moveTouchIdentifier) {
                vr_isDrag = 1;

                moveTouchIdentifier = touch.identifier;

                vr_endX = vr_lon;
                vr_endY = vr_lat;

                vr_startX = touch.clientX;
                vr_startY = touch.clientY;
            }

            if (2 === touches.length) {
                vr_isDrag = 0;

                var _touch1 = touches[0],
                    _touch2 = touches[1];

                var _x = Math.abs(_touch1.clientX - _touch2.clientX),
                    _y = Math.abs(_touch1.clientY - _touch2.clientY);

                scaleStartDistance = Math.sqrt(Math.pow(_x, 2) + Math.pow(_y, 2));

                scaleStartFov = camera.fov;
            }
        }

        function vrTouchMove(event) {
            event.preventDefault();

            vr_isMove = 1;

            var touches = event.targetTouches,
                changedTouches = event.changedTouches,
                changedTouch = changedTouches[0];

            if (moveTouchIdentifier === changedTouch.identifier && vr_isDrag) {
                vr_moveX = vr_startX - changedTouch.clientX;
                vr_moveY = changedTouch.clientY - vr_startY;

                vr_lon = vr_moveX / vr_clientHeight * 1.5 * _vr.fov / DEFAULT_FOV + vr_endX;

                vr_lat = vr_moveY / vr_clientHeight * 1.5 * _vr.fov / DEFAULT_FOV + vr_endY;
            }

            // 滑动缩放功能
            if (touches.length > 1) {
                var _touch1 = touches[0],
                    _touch2 = touches[1];

                var _x = Math.abs(_touch1.clientX - _touch2.clientX),
                    _y = Math.abs(_touch1.clientY - _touch2.clientY);

                var moveDistance = Math.sqrt(Math.pow(_x, 2) + Math.pow(_y, 2)) - scaleStartDistance;

                _vr.fov = scaleStartFov - moveDistance * 0.2;

                _vr.fov = Math.min(MAX_FOV, Math.max(MIN_FOV, _vr.fov));

                camera.fov = _vr.fov;
                camera.updateProjectionMatrix();
            }
        }

        function vrTouchEnd(event) {
            var touches = event.targetTouches,
                touch = touches[0],
                changedTouches = event.changedTouches,
                changedTouch = changedTouches[0];

            if (moveTouchIdentifier === changedTouch.identifier) {
                vr_isDrag = 0;
                moveTouchIdentifier = undefined;
            }

            if (1 === touches.length) {
                vr_isDrag = 1;
                moveTouchIdentifier = touch.identifier;

                vr_endX = vr_lon;
                vr_endY = vr_lat;

                vr_startX = touch.clientX;
                vr_startY = touch.clientY;
            }
        }

        function vrMouseDown(event) {
            //event.preventDefault();

            vr_isDrag = 1;
            vr_isMove = 0;

            vr_endX = vr_lon;
            vr_endY = vr_lat;

            vr_startX = event.clientX;
            vr_startY = event.clientY;

            vr_clientWidth = elem.clientWidth;
            vr_clientHeight = elem.clientHeight;
        }

        function vrMouseMove(event) {
            event.preventDefault();

            vr_isMove = 1;

            if (vr_isDrag) {
                vr_moveX = vr_startX - event.clientX;
                vr_moveY = event.clientY - vr_startY;

                vr_lon = vr_moveX / vr_clientHeight * 1.5 * _vr.fov / DEFAULT_FOV + vr_endX;

                vr_lat = vr_moveY / vr_clientHeight * 1.5 * _vr.fov / DEFAULT_FOV + vr_endY;
            }
        }

        function vrMouseUp(event) {
            //event.preventDefault();

            vr_isDrag = 0;
            //vr_isMove = 0;
        }

        function hideExitVR() {
            clearTimeout(hideExitVRTimeoutID);
            hideExitVRTransitionState = 0;

            $exitVR.show();
            setTimeout(function () {
                $exitVR.css(transition, "all .4s").css("opacity", 1);
            }, 10);

            hideExitVRTimeoutID = setTimeout(function () {
                $exitVR.css(transition, "all .6s").css("opacity", 0);

                hideExitVRTransitionState = 1;
            }, 4000);
        }

        $exitVR.on(transitionEnd, function () {
            if (1 === hideExitVRTransitionState) {
                $exitVR.hide();
                hideExitVRTransitionState = 0;
            }
        }, false);

        function requestStereo() {
            _vr.isVRView = 1;

            renderer = stereoEffect;

            fullscreen.request();

            if (supportOrientation) {
                orientationControls.connect();
                _vr.isOrientation = 1;
            }

            $body.addClass("vr-full");
            $main.addClass("is-vr");

            $exitVR.show();

            clearTimeout(hideExitVRTimeoutID);
            hideExitVRTimeoutID = setTimeout(function () {
                $exitVR.css(transition, "all .6s").css("opacity", 0);

                hideExitVRTransitionState = 1;
            }, 3000);

            $main.on("click", hideExitVR);

            vrResize();

            return _vr;
        }

        function exitStereo() {
            _vr.isVRView = 0;

            renderer = normalEffect;

            orientationControls.disconnect();
            _vr.isOrientation = 0;
            $orientation.removeClass(btnActiveClassName);

            fullscreen.exit();

            $body.removeClass("vr-full");
            $main.removeClass("is-vr");

            clearTimeout(hideExitVRTimeoutID);
            $exitVR.hide();

            $main.off("click", hideExitVR);

            $fullscreen.removeClass(btnActiveClassName);

            vrResize();

            return _vr;
        }

        function changeOrientation() {
            if (supportOrientation) {
                if (_vr.isOrientation) {
                    orientationControls.disconnect();
                    $orientation.removeClass(btnActiveClassName);
                } else {
                    orientationControls.connect();
                    $orientation.addClass(btnActiveClassName);
                }

                _vr.isOrientation = !_vr.isOrientation;
            } else {
                _vr.toast(MESSAGES[1]);
            }

            return _vr;
        }

        var image = new Image();
        image.crossOrigin = "anonymous";

        _vr.image = image;
        _vr.main = elem;


        if(supportVR) {
            this.fov = DEFAULT_FOV;  // 视野（角度）
            this.isVRView = 0;       // 是否VR视角
            this.isOrientation = 0;  // 陀螺仪控制

            renderer = normalEffect = new THREE.WebGLRenderer();

            stereoEffect = new THREE.StereoEffect(renderer);

            camera = new THREE.PerspectiveCamera(DEFAULT_FOV, elem.clientWidth / elem.clientHeight, 1, 1000);

            scene = new THREE.Scene();

            orientationControls = new THREE.DeviceOrientationControls(camera);

            image.onload = function() {
                image.onload = null;

                $controls.append($stereoEffect).append($fullscreen).append($orientation);
                $main.append($controls).append($exitVR).append($ui).addClass("is-ready");

                var width = this.width,
                    height = this.height;

                if(width / height !== 2) {
                    console.warn("The image size does not conform to the panoramic display, will produce deformation.");
                }

                texture = new THREE.Texture(image);
                texture.needsUpdate = true;

                material = new THREE.MeshBasicMaterial({
                    map: texture
                });

                //material.side = THREE.DoubleSide;

                sphere = new THREE.SphereBufferGeometry(RADIUS, 60, 60);
                sphere.scale(-1, 1, 1);

                mesh = new THREE.Mesh(sphere, material);
                scene.add(mesh);

                renderer.render(scene, camera);

                $root.on("resize", vrResize);

                $ui.on("mousedown", vrMouseDown).on("touchstart", vrTouchStart).on("mousemove", vrMouseMove).on("touchmove", vrTouchMove);

                $ui.on("mouseup mouseout touchcancel", vrMouseUp).on("touchend", vrTouchEnd);

                $stereoEffect.on("click", requestStereo);
                $orientation.on("click", changeOrientation);
                $exitVR.on("click", exitStereo);
                $main.on("mousewheel MozMousePixelScroll", vrMouseWheel);

                // 全屏按钮
                $fullscreen.on("click", function () {
                    if ($main.hasClass("is-fullscreen")) {
                        fullscreen.exit();
                        $body.removeClass("vr-full");
                        $main.removeClass("is-fullscreen");
                        $fullscreen.removeClass(btnActiveClassName);
                    } else {
                        fullscreen.request();
                        $body.addClass("vr-full");
                        $main.addClass("is-fullscreen");
                        $fullscreen.addClass(btnActiveClassName);
                    }

                    vrResize();
                });

                // 全屏事件改变触发
                fullscreen.on(function () {  // TODO chrome 仿移动浏览器退出全屏未触发事件
                    if (doc[fullscreen.fullscreenElement] !== doc.documentElement) {
                        $body.removeClass("vr-full");
                        $main.removeClass("is-fullscreen");
                        $fullscreen.removeClass(btnActiveClassName);
                    }

                    vrResize();
                });

                var vrUpload = function () {
                    vr_lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, vr_lat));

                    var x = RADIUS * Math.cos(vr_lon) * Math.cos(vr_lat);

                    var y = RADIUS * Math.sin(vr_lat);

                    var z = RADIUS * Math.sin(vr_lon) * Math.cos(vr_lat);

                    var target = new THREE.Vector3(x, y, z);

                    if (_vr.isOrientation) {
                        orientationControls.update();
                    } else {
                        camera.lookAt(target);
                    }

                    // TODO 性能监测
                    //stats.update();

                    renderer.render(scene, camera);

                    vrRequestID = requestAnimationFrame(vrUpload);
                };

                vrUpload();

                _vr.resize = vrResize;
                _vr.requestStereo = requestStereo;
                _vr.exitStereo = exitStereo;
                _vr.changeOrientation = changeOrientation;
            };

            image.onerror = function() {
                image.onerror = null;
                _vr.toast(MESSAGES[3]);

                throw new Error("Image resource loading errors.");
            };

            image.src = config.src;

            renderer.setSize(elem.clientWidth, elem.clientHeight);
            renderer.setClearColor(0x666666);
            domElement = renderer.domElement;
            $main.append(domElement);

            // 性能检测
            /*stats = new Stats();
            $body.append(stats.dom);*/
        }
    };

    imageVR.fn.init.prototype = imageVR.prototype;

    if ("function" === typeof define && define.amd) {
        define(["three", "three-extend"], function () {
            return imageVR;
        });
    } else if ("object" === typeof exports) {
        module.exports = imageVR;
    } else {
        window.imageVR = imageVR;
    }
}(function() {
    var $ = function (selector) {
        return new $.fn.init(selector);
    };

    var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;

    var version = "1.0.0",
        expando = "JQ" + (version + Math.random()).replace(/\D/g, ""),
        guid = 0;  // globally unique identifier

    $.expando = expando;

    var _eventsCache = {};

    function setElemGuid(elem) {
        if (!elem.hasOwnProperty(expando)) {
            Object.defineProperty(elem, expando, {
                value: ++guid
            });
        }

        return elem[expando];
    }

    function getElemEvents(elem, event) {
        if (elem.hasOwnProperty(expando)) {
            var elemGuid = elem[expando];

            var events = _eventsCache[event];

            if (events) {
                events = events.filter(function (item) {
                    return item.guid === elemGuid;
                });

                if (events.length > 0) {
                    return events;
                }
            }
        }

        return [];
    }

    var _defaultDisplayCache = {};

    (function () {
        if (typeof window.CustomEvent === "function") {
            return false;
        }
        function CustomEvent(event, params) {
            params = params || {bubbles: false, cancelable: false, detail: null};
            var evt = document.createEvent("CustomEvent");
            evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
            return evt;
        }

        CustomEvent.prototype = window.Event.prototype;

        window.CustomEvent = CustomEvent;
    }());

    function createEvents(types, params) {
        var events = [];
        params = params || {bubbles: false, cancelable: false, detail: null};

        if ("string" === typeof types && (types = $.trim(types))) {
            types = types.split(/\s+/);

            types.forEach(function (event) {
                events.push(new CustomEvent(event, params));
            });

        }

        return events;
    }

    function _eventHandler(event) {
        var _this = this;

        if (_eventsCache[event.type]) {
            _eventsCache[event.type].filter(function (item) {
                return item.guid === _this[expando];
            }).forEach(function (item) {
                if (item.selector == null) {  // not event delegation
                    item.handler.call(_this, event);
                } else {

                    // has event delegation, the first step to use querySelectorAll found nodes,
                    // then match and event.target, if matched call event handler.
                    // iterative bubbling up unit the target is equal to the delegate object.
                    var matchNodeList = [];

                    try {
                        matchNodeList = arrFn.slice.call(_this.querySelectorAll(item.selector), 0);
                    } catch (e) {
                    }

                    var target = event.target;

                    while (target !== _this) {
                        if (-1 !== matchNodeList.indexOf(target)) {
                            item.handler.call(target, event);
                        }

                        target = target.parentNode;
                    }
                }
            });
        }
    }

    var objToString = Object.prototype.toString;

    var arrFn = Array.prototype;

    $.css = function (elem, style) {
        if (elem && 1 === elem.nodeType) {
            return window.getComputedStyle(elem, null)[style]
        }
    };

    $.isHidden = function (elem) {
        return $.css(elem, "display") === "none";
    };

    $.trim = function (text) {
        return text == null ? "" : (text + "").replace(rtrim, "");
    };

    $.isArray = function (arg) {
        return Array.isArray(arg);
    };

    $.isObject = function (arg) {
        return objToString.call(arg) === "[object Object]";
    };

    function showHide(elements, show) {
        var elem, style;

        for (var i = 0; i < elements.length; i++) {
            elem = elements[i];
            style = elem.style;

            var elemGuid = setElemGuid(elem);

            if (show) {
                style.display = "";

                if ($.isHidden(elem)) {
                    if (_defaultDisplayCache.hasOwnProperty(elemGuid)) {
                        style.display = _defaultDisplayCache[elemGuid];
                    } else {
                        style.display = _defaultDisplayCache[elemGuid] = defaultDisplay(elem.nodeName);
                    }
                } else {
                    _defaultDisplayCache[elemGuid] = $.css(elem, "display");
                }
            } else {
                if (!$.isHidden(elem)) {
                    _defaultDisplayCache[elemGuid] = $.css(elem, "display");

                    style.display = "none";
                }
            }
        }
    }

    function defaultDisplay(nodeName) {
        var iframe = document.createElement("iframe");
        iframe.width = 0;
        iframe.height = 0;
        iframe.frameBorder = 0;

        document.documentElement.appendChild(iframe);

        var doc = iframe.contentDocument;

        var elem = doc.createElement(nodeName);
        doc.body.appendChild(elem);

        var display = $.css(elem, "display");

        document.documentElement.removeChild(iframe);

        return display;
    }

    $.fn = $.prototype = {
        constructor: $,
        eq: function (index) {
            if ("number" === typeof index) {
                var item = this[index];

                return $.fn.init(item);
            }

            return this;
        },
        first: function () {
            return $.fn.eq.call(this, 0);
        },
        last: function () {
            var index = this.length - 1;
            return $.fn.eq.call(this, index);
        },
        append: function (content) {
            var frag = document.createDocumentFragment();

            if (content instanceof $ || /^\[object (NodeList|HTMLCollection)]$/.test(objToString.call(content))) {
                if (this.last()[0]) {
                    arrFn.slice.call(content).forEach(function (item) {
                        frag.appendChild(item);
                    });

                    this.last()[0].appendChild(frag);
                }
            } else if (typeof content === "string") {
                this.each(function (item) {
                    item.appendChild(document.createTextNode(content));
                });
            } else if (1 === content.nodeType || 11 === content.nodeType) {
                if (this.last()[0]) {
                    this.last()[0].appendChild(content);
                }
            }

            frag = null;
            return this;
        },
        attr: function (name, value) {
            if ($.isObject(name)) {
                this.each(function (elem) {
                    for (var x in name) {
                        if (name.hasOwnProperty(x)) {
                            try {
                                elem.setAttribute(x, name[x]);
                            } catch (e) {
                            }
                        }
                    }
                });
            } else if ("string" === typeof name && (name = $.trim(name))) {
                if (arguments.length <= 1) {
                    var elem = this.first()[0];

                    return elem ? elem.getAttribute(name) : null;
                } else {
                    this.each(function (elem) {
                        elem.setAttribute(name, value + "");
                    });
                }
            }

            return this;
        },
        prop: function (name, value) {
            if ($.isObject(name)) {
                this.each(function (elem) {
                    for (var x in name) {
                        if (name.hasOwnProperty(x)) {
                            elem[x] = name[x];
                        }
                    }
                });
            } else if ("string" === typeof name && (name = $.trim(name))) {
                if (arguments.length <= 1) {
                    var elem = this.first()[0];

                    return elem ? elem[name] : null;
                } else {
                    this.each(function (elem) {
                        elem[name] = value;
                    });
                }
            }

            return this;
        },
        css: function (name, value) {
            if ($.isObject(name)) {
                this.each(function (elem) {
                    for (var x in name) {
                        if (name.hasOwnProperty(x)) {
                            elem.style[x] = name[x];
                        }
                    }
                })
            } else if ("string" === typeof name && (name = $.trim(name))) {
                if (arguments.length === 1) {
                    var elem = this.first()[0];

                    return $.css(elem, name);
                } else if (arguments.length >= 2) {
                    this.each(function (elem) {
                        elem.style[name] = value;
                    })
                }
            }

            return this;
        },
        each: function (callback) {
            var length = this.length;

            if (length > 0 && "function" === typeof callback) {
                var i = 0,
                    elem;

                for (i; i < length; i++) {
                    elem = this[i];
                    callback.call(elem, elem, i);
                }
            }

            return this;
        },
        on: function (types, selector, handler, one) {
            var _this = this;

            if (handler == null) {
                handler = selector;
                selector = undefined;
            }

            if (!handler) {
                return this;
            }

            if (!handler.hasOwnProperty("guid")) {
                handler.guid = ++guid;
            }

            var eventsArr = $.trim(types).split(/\s+/);

            if (eventsArr.length > 0) {
                this.each(function (elem) {
                    var elemGuid = setElemGuid(elem);

                    eventsArr.forEach(function (event) {
                        _eventsCache[event] = _eventsCache[event] || [];

                        var elemEvents = getElemEvents(elem, event);

                        if (0 === elemEvents.length) {
                            elem.addEventListener(event, _eventHandler, false);
                        }

                        var handlerObj = {
                            guid: elemGuid,
                            type: event,
                            handler: handler,
                            selector: selector,
                            elem: elem
                        };

                        if (one === 1) {
                            handlerObj.handler = function (event) {
                                $.fn.off.call(_this, event.type, selector, handlerObj.handler);

                                handler.apply(elem, arguments);
                            };

                            handlerObj.handler.guid = handler.guid;
                        }

                        _eventsCache[event].push(handlerObj);
                    });
                });
            }

            return this;
        },
        one: function (types, selector, handler) {
            $.fn.on.call(this, types, selector, handler, 1);

            return this;
        },
        off: function (types, selector, handler) {
            if (handler == null) {
                handler = selector;
                selector = undefined;
            }

            var eventsArr = $.trim(types).split(/\s+/);

            if (eventsArr.length > 0) {
                this.each(function (elem) {
                    var elemGuid = elem[expando];

                    if (elemGuid !== undefined) {
                        eventsArr.forEach(function (event) {
                            var _eventsArr = _eventsCache[event];
                            if (_eventsArr) {
                                if (!handler) {
                                    _eventsCache[event] = _eventsArr.filter(function (item) {
                                        return item.guid !== elemGuid || item.selector !== selector;
                                    });
                                } else {
                                    _eventsCache[event] = _eventsArr.filter(function (item) {
                                        return item.guid !== elemGuid || item.selector !== selector ||
                                            item.handler.guid !== handler.guid;
                                    })
                                }

                                if (getElemEvents(elem, event).length === 0) {
                                    elem.removeEventListener(event, _eventHandler, false);
                                }
                            }
                        });
                    }
                });
            }

            return this;
        },
        trigger: function (types, params) {
            params = params || {
                    bubbles: true,
                    cancelable: true,
                    detail: null
                };
            var events = createEvents(types, params);

            this.each(function (elem) {
                events.forEach(function (event) {
                    elem.dispatchEvent(event);
                })
            });

            return this;
        },
        addClass: function (className) {
            if ("string" === typeof className && (className = $.trim(className))) {
                className = className.split(/\s+/);

                this.each(function (itemNode) {
                    className.forEach(function (itemName) {
                        itemNode.classList.add(itemName);
                    })
                });
            }

            return this;
        },
        removeClass: function (className) {
            if ("string" === typeof className && (className = $.trim(className))) {
                className = className.split(/\s+/);

                this.each(function (itemNode) {
                    className.forEach(function (itemName) {
                        itemNode.classList.remove(itemName);
                    });
                })
            }

            return this;
        },
        hasClass: function (className) {
            if ("string" === typeof className && (className = $.trim(className)) && this.length > 0) {
                className = className.split(/\s+/);

                var has = true;

                for (var i = 0; i < this.length; i++) {
                    var itemNode = this[i];

                    has = className.every(function (itemName) {
                        return itemNode.classList.contains(itemName)
                    });

                    if (!has) {
                        return false;
                    }
                }

                return has;
            } else {
                return false;
            }
        },
        show: function () {
            showHide(this, 1);

            return this;
        },
        hide: function () {
            showHide(this);

            return this;
        },
        html: function (string) {
            if (arguments.length > 0) {
                this.each(function (elem) {
                    elem.innerHTML = string + "";
                })
            } else {
                var elem = this.first()[0];

                return elem ? elem.innerHTML : "";
            }

            return this;
        },
        text: function (string) {
            if (arguments.length > 0) {
                this.each(function (elem) {
                    elem.textContent = string + "";
                })
            } else {
                var elem = this.first()[0];

                return elem ? elem.textContent : "";
            }

            return this;
        }
    };

    $.fn.init = function (selector) {
        var _this = this;

        if (selector == null) {
            return _this;
        }

        if (1 === selector.nodeType) {
            _this[0] = selector;
            _this.selector = "";
            _this.length = 1;

            return _this;
        } else if (/^\[object (NodeList|HTMLCollection)]$/.test(objToString.call(selector))) {
            var elemArr = Array.prototype.slice.call(selector).filter(function (item) {
                return 1 === item.nodeType;
            });

            if (elemArr.length > 0) {
                elemArr.forEach(function (item, index) {
                    _this[index] = item;
                });

                _this.selector = "";
                _this.length = elemArr.length;
            }

            return _this;
        } else if (11 === selector.nodeType) {
            var fragElemArr = Array.prototype.slice.call(selector.children);

            if (fragElemArr.length > 0) {
                fragElemArr.forEach(function (item, index) {
                    _this[index] = item;
                });

                _this.selector = "";
                _this.length = fragElemArr.length;
            }

            return _this;
        } else {
            if (selector === window || selector === document) {
                _this[0] = selector;
                _this.selector = "";
                _this.length = 1;

                return _this;
            } else if ("string" === typeof selector && (selector = $.trim(selector))) {
                var nodeList, nodeLength;

                try {
                    nodeList = document.querySelectorAll(selector);
                    nodeLength = nodeList.length;
                } catch (e) {
                }

                if (nodeLength > 0) {
                    for (var i = 0; i < nodeLength; i++) {
                        _this[i] = nodeList[i];
                    }
                    _this.selector = selector;
                    _this.length = nodeLength;
                }
            }

            return _this;
        }
    };

    $.fn.init.prototype = $.fn;

    return $;
}));