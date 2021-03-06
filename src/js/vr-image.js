/**
 * Created by wangchunyang on 16/7/29.
 * Bugs
 * UC Android 浏览器改变 canvas 大小导致模型图片材质失效,需要在改变大小后设置 texture.needUpdate = true
 * 华为手机系统浏览器显示效果太差
 * HTC 5.0 默认浏览器调用全屏没有作用; 不能同时绑定两个 deviceorientation 事件
 * IOS 浏览器不支持全屏
 *
 * window IE11 以下不支持 webGL，IE11不支持渲染 video
 * Edge 支持
 */

;(function(jQuery) {
    var $ = jQuery(),
        root = window,
        doc = document,
        html = doc.documentElement,
        body = doc.body,
        $root = $(root),
        $body = $(body);

    var VERSION = "1.3.0";

    var active_class_name = "active",
        lock_body_class_name = "vr-lock",
        full_main_class_name = "is-fullscreen",
        ready_class_name = "is-ready",
        vr_class_name = "is-vr";

    var MESSAGES = [
        "您的浏览器不支持全景图片",
        "您的浏览器不支持陀螺仪",
        "您的浏览器不支持全屏",
        "图片资源不可用"
    ];

    var RADIUS = 100,      // VR视角球体半径
        DEFAULT_FOV = 75,  // 初始 camera 视角
        MIN_FOV = 30,      // camera 视角最大值
        MAX_FOV = 120;     // camera 视角最小值

    var supportOrientation = false;  // 是否支持陀螺仪,加载后检测是否支持

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
            chrome: /Chrome\/[\d\\.]+ Mobile Safari\/[\d\\.]+$/i.test(u),
            firefox: /Firefox/i.test(u),
            ie: /MSIE/i.test(u),
            ie11: /Trident\/7\.0/i.test(u),
            edge: /Edge/i.test(u)
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

    var testedOrientation = false;

    var deviceOrientationCallback = [];

    // 支持陀螺仪检测
    $root.one("deviceorientation", function (event) {
        testedOrientation = true;

        supportOrientation = null !== event.alpha;
        imageVR.fn.supportOrientation = supportOrientation;

        while (deviceOrientationCallback.length) {
            deviceOrientationCallback.shift()(supportOrientation);
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

    imageVR.jQuery = $;
    imageVR.browser = browser;

    imageVR.fn = imageVR.prototype = {
        version: VERSION,
        constructor: imageVR,
        setSrc: function(src) {
            var $image = this.$image;

            this.$main.find(".loading-vr").show();
            this.canvas.style.opacity = 0;

            if($image) {
                $image.attr("src", src);
            }
        },
        deviceOrientation: function(callback) {
            if("function" === typeof callback) {
                if(testedOrientation) {
                    callback(supportOrientation);
                } else {
                    deviceOrientationCallback.push(callback);
                }
            }
        },
        destroy: function () {
            if("destroy" === this.status) {
                return;
            }

            cancelAnimationFrame(this.vrRequestID);

            this.$image.off();

            var $main = this.$main;

            fullscreen.exit();

            $root.off();

            $main.off().find(".ui-vr").off();

            $main.find(".stereo, .orientation, .exit-vr, .fullscreen").off();

            fullscreen.off();

            var mainClassName = ["image-vr", full_main_class_name, ready_class_name, vr_class_name];

            $main.empty().removeClass(mainClassName.join(" "));
            // $body.removeClass(LOCK_BODY_CLASS_NAME);

            this.status = "destroy";
        },
        fullscreen: function () {
            var $main = this.$main;

            if ($main) {
                if ($main.hasClass(full_main_class_name)) {
                    fullscreen.exit();
                    // $body.removeClass(LOCK_BODY_CLASS_NAME);
                    $main.removeClass(full_main_class_name);
                } else {
                    fullscreen.request();
                    // $body.addClass(LOCK_BODY_CLASS_NAME);
                    $main.addClass(full_main_class_name);
                }
            }
            return this;
        },
        toast: (function () {
            var $elem = $("#vrToast"),
                duration = 4000,
                isVisible = 0,
                identity;

            if (undefined === $elem[0]) {
                $elem = $.createElem("div", "vr-toast").attr("id", "vrToast").hide();
                $body.append($elem);
            }

            function show(text) {
                $elem.text(text).show();
                isVisible = 1;
                clearTimeout(identity);
                identity = setTimeout(function () {
                    $elem.hide();
                    isVisible = 0;
                }, duration);

                return identity;
            }

            function hide() {
                if (isVisible) {
                    clearTimeout(identity);
                    $elem.hide();
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

        /*if(!conf || "string" !== typeof conf.src) {
            throw new TypeError("Failed to 'imageVR' arguments, 2 argument must be 'Object' and attribute 'src' must be 'String'");
        }*/

        conf = "object" === typeof conf ? conf : {};

        var config = {
            // ratio: 272 / 480
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
            $ui = $.createElem("div", "ui-vr"),
            $loading = $.createElem("div", "loading-vr"),
            $message = $.createElem("div", "message-vr"),
            $exitVR = $.createElem("div", "exit-vr"),
            $controls = $.createElem("div", "controls-vr"),
            $stereoEffect = $.createElem("button", "stereo"),
            $fullscreen = $.createElem("button", "fullscreen"),
            $orientation = $.createElem("button", "orientation");

        if(!supportVR) {
            return;
        }

        $main.append($ratio);

        $main.addClass("image-vr");

        $ui.append($loading.html('<i class="icon rotate"></i><span class="text">' +
            (config.loading || '加载中...') + '</span>')).append($message);

        $main.append($ui);

        if(!isNaN(config.ratio)) {
            $ratio.css("padding-top", config.ratio * 100 + "%");
        }

        $exitVR.text("退出VR视角");

        /**
         * start VR variable
         */
        var renderer, scene, camera, normalEffect, stereoEffect, stats;

        var mesh, sphere, material, texture;

        var orientationControls;

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
            var width = elem.clientWidth,
                height = elem.clientHeight;

            camera.aspect = width / height;
            camera.updateProjectionMatrix();

            renderer.setSize(width, height);

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

            // $body.addClass(LOCK_BODY_CLASS_NAME);
            $main.addClass(vr_class_name);

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

            /*orientationControls.disconnect();
            _vr.isOrientation = 0;
            $orientation.removeClass(ACTIVE_CLASS_NAME);*/

            fullscreen.exit();

            // $body.removeClass(LOCK_BODY_CLASS_NAME);
            $main.removeClass(vr_class_name);

            clearTimeout(hideExitVRTimeoutID);
            $exitVR.hide();

            $main.off("click", hideExitVR);

            $fullscreen.removeClass(active_class_name);

            vrResize();

            return _vr;
        }

        function changeOrientation() {
            if (supportOrientation) {
                if (_vr.isOrientation) {
                    orientationControls.disconnect();
                    $orientation.removeClass(active_class_name);
                } else {
                    orientationControls.connect();
                    $orientation.addClass(active_class_name);
                }

                _vr.isOrientation = !_vr.isOrientation;
            } else {
                _vr.toast(MESSAGES[1]);
            }

            return _vr;
        }

        var $image = $.createElem("img");
        $image.attr("crossOrigin", "anonymous");

        _vr.$image = $image;
        _vr.$main = $(elem);
        _vr.fov = DEFAULT_FOV;  // 视野（角度）
        _vr.isVRView = 0;       // 是否VR视角
        _vr.isOrientation = 0;  // 陀螺仪控制

        renderer = normalEffect = new THREE.WebGLRenderer();

        stereoEffect = new THREE.StereoEffect(renderer);

        camera = new THREE.PerspectiveCamera(DEFAULT_FOV, elem.clientWidth / elem.clientHeight, 1, 1000);

        scene = new THREE.Scene();

        orientationControls = new THREE.DeviceOrientationControls(camera);

        $image.on("change", function() {
            texture = new THREE.Texture(_vr.$image[0]);
            texture.needsUpdate = true;
        });

        $image.one("load", function() {
            $controls.append($stereoEffect).append($fullscreen).append($orientation);
            $main.append($controls).append($exitVR).addClass(ready_class_name);

            var width = this.width,
                height = this.height;

            if(width / height !== 2) {
                console.warn("The image size does not conform to the panoramic display, will produce deformation.");
            }

            texture = new THREE.Texture(_vr.$image[0]);
            // texture.needsUpdate = true;

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

            $ui.on("mousedown", vrMouseDown)
                .on("touchstart", vrTouchStart)
                .on("mousemove", vrMouseMove)
                .on("touchmove", vrTouchMove);

            $ui.on("mouseup mouseout touchcancel", vrMouseUp)
                .on("touchend", vrTouchEnd);

            $stereoEffect.on("click", requestStereo);
            $orientation.on("click", changeOrientation);
            $exitVR.on("click", exitStereo);
            $main.on("mousewheel MozMousePixelScroll", vrMouseWheel);

            // 全屏按钮
            $fullscreen.on("click", function () {
                _vr.fullscreen();

                vrResize();
            });

            // 全屏事件改变触发
            fullscreen.on(function () {  // chrome 仿移动浏览器退出全屏未触发事件
                if (doc[fullscreen.fullscreenElement] !== doc.documentElement) {
                    // $body.removeClass(LOCK_BODY_CLASS_NAME);
                    $main.removeClass(full_main_class_name);
                    $fullscreen.removeClass(active_class_name);
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

                // 性能监测
                //stats.update();

                renderer.render(scene, camera);

                _vr.vrRequestID = requestAnimationFrame(vrUpload);
            };

            vrUpload();

            _vr.resize = vrResize;
            _vr.requestStereo = requestStereo;
            _vr.exitStereo = exitStereo;
            _vr.changeOrientation = changeOrientation;
        }).on("load", function(event) {
            $loading.hide();
            $message.hide();

            texture.needsUpdate = true;

            _vr.canvas.style.opacity = 1;

            if("function" === typeof _vr.load) {
                _vr.load(event);
            }
        }).on("error", function() {
            $loading.hide();
            $message.text(MESSAGES[3]).show();

            throw new Error("Image resource loaded errors.");
        });

        if(conf.src) {
            $image.attr("src", config.src);
        }

        renderer.setClearColor(0x666666);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(elem.clientWidth, elem.clientHeight);
        _vr.canvas = renderer.domElement;
        $main.append(_vr.canvas);

        // 性能检测
        /*stats = new Stats();
         $body.append(stats.dom);*/
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

    var version = "1.3.0",
        expando = "JQ" + (version + Math.random() + "").replace(/\D/g, ""),
        guid = 0;  // globally unique identifier

    $.expando = expando;
    $.version = version;

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

    var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;

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

    $.arrayFrom = function (arg) {
        if (Array.from) {
            return Array.from(arg);
        } else {
            return Array.prototype.slice.call(arg, 0);
        }
    };

    $.isObject = function (arg) {
        return objToString.call(arg) === "[object Object]";
    };

    function showHide(elements, show) {
        var elem, style, nodeName;

        for (var i = 0; i < elements.length; i++) {
            elem = elements[i];
            style = elem.style;
            nodeName = elem.nodeName;

            if (show) {
                style.display = "";

                if ($.isHidden(elem)) {
                    if (_defaultDisplayCache.hasOwnProperty(nodeName)) {
                        style.display = _defaultDisplayCache[nodeName];
                    } else {
                        style.display = _defaultDisplayCache[nodeName] = defaultDisplay(elem.nodeName);
                    }
                } else {
                    _defaultDisplayCache[nodeName] = $.css(elem, "display");
                }
            } else {
                if (!$.isHidden(elem)) {
                    _defaultDisplayCache[nodeName] = $.css(elem, "display");

                    style.display = "none";
                }
            }
        }
    }

    function defaultDisplay(nodeName) {
        var elem = document.createElement(nodeName);
        document.body.appendChild(elem);

        var display = $.css(elem, "display");

        document.body.removeChild(elem);

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

            if ("" === $.trim(types)) {
                this.each(function (elem) {
                    var elemGuid = elem[expando];

                    if (elemGuid) {
                        for (var x in _eventsCache) {
                            _eventsCache[x] = _eventsCache[x].filter(function (item) {
                                return item.guid !== elemGuid;
                            });

                            elem.removeEventListener(x, _eventHandler, false);
                        }
                    }
                });
            } else {
                var eventsArr = $.trim(types).split(/\s+/);

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
                    var curClassName = itemNode.className.split(/\s+/);

                    className.forEach(function (itemName) {
                        if (-1 === curClassName.indexOf(itemName)) {
                            curClassName.push(itemName);
                        }
                    });

                    itemNode.className = curClassName.join(" ");
                });
            }

            return this;
        },
        removeClass: function (className) {
            if ("string" === typeof className && (className = $.trim(className))) {
                className = className.split(/\s+/);

                this.each(function (itemNode) {
                    var curClassName = itemNode.className.split(/\s+/);

                    className.forEach(function (itemName) {
                        var index = curClassName.indexOf(itemName);

                        if (-1 !== index) {
                            curClassName.splice(index, 1);
                        }
                    });

                    itemNode.className = curClassName.join(" ");
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
                        return -1 !== itemNode.className.split(/\s+/).indexOf(itemName);
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
        },
        empty: function () {
            this.each(function (elem) {
                if (elem.childNodes) {
                    var childNodes = elem.childNodes;

                    childNodes = $.arrayFrom(childNodes);

                    childNodes.forEach(function (item) {
                        elem.removeChild(item);
                    });
                }
            });

            return this;
        },
        remove: function () {
            this.each(function (elem) {
                if (elem.parentNode) {
                    $(elem).off();

                    elem.parentNode.removeChild(elem);
                }
            });

            return this;
        },
        find: function (selector) {
            this.selector = selector;

            var arrayElem = [];

            this.each(function (elem) {
                try {
                    var htmlCollection = elem.querySelectorAll(selector);

                    htmlCollection = $.arrayFrom(htmlCollection);

                    arrayElem = arrayElem.concat(htmlCollection);
                } catch (e) {
                }
            });

            return $(arrayElem);
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
            var elemArr = $.arrayFrom(selector).filter(function (item) {
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
            var fragElemArr = $.arrayFrom(selector.children);

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
            } else if ($.isArray(selector)) {

                selector = selector.filter(function (item) {
                    return item.nodeType === 1;
                });

                selector.forEach(function (item, index) {
                    _this[index] = item;
                });

                _this.length = selector.length;
            }

            return _this;
        }
    };

    $.fn.init.prototype = $.fn;

    return $;
}));