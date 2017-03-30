/**
 * Created by Wangcy on 2016/7/11.
 * Bugs
 * Android QQ|UC|百度 等一系列浏览器 video 被系统播放器挟持,不能使用 video 作为材质渲染,
 * 欧朋,猎豹等浏览器 video 用作材质没有画面,只有声音,
 * Android 平台目前只有 chrome, firefox, 360 可以正常观看 VR 视频, 视频分辨率不能大于2K, 否则无法解码
 * IOS 平台 video 必须同域
 * iphone video 元素需要添加 webkit-playsinline playsinline
 *
 * window IE11 以下不支持 webGL，IE11不支持渲染 video
 * Edge 支持
 * 不能播放 1920*960 视频
 */
;(function (jQuery) {
    var $ = jQuery(),
        root = window,
        doc = document,
        body = doc.body,
        $root = $(root),
        $doc = $(doc),
        $body = $(body);

    var VERSION = "1.2.0";

    var zoom_out_class_name = "vp-zoomOut",
        active_class_name = "active",
        lock_class_name = "vr-lock",
        full_class_name = "is-fullscreen",
        mouseout_class_name = "is-mouseout",
        stalled_class_name = "is-stalled",
        loading_class_name = "is-loading",
        playing_class_name = "is-playing",
        paused_class_name = "is-paused",
        ended_class_name = "is-ended",
        animation_class_name = "is-animation",
        error_class_name = "is-error",
        load_class_name = "is-load",
        ready_class_name = "is-ready";

    var controlDisplayTime = 4000;   // 未操作控制台显示时间
    var seekTimeDisplayTime = 1000;  // 快进显示时间

    var RADIUS = 100,      // VR视角球体半径
        DEFAULT_FOV = 75,  // 初始 camera 视角
        MIN_FOV = 30,      // camera 视角最大值
        MAX_FOV = 120;     // camera 视角最小值

    var supportOrientation = 0;  // 是否支持陀螺仪,加载后检测是否支持

    var VR_STATE_MESSAGES = [
        "您的浏览器不支持WebGL",
        "您的浏览器不支持陀螺仪",
        "您的浏览器不支持全屏",
        "视频加载失败"
    ];

    var VIDEO_ERRORS_MESSAGE = [
        "",
        "视频加载中止",
        "网络错误",
        "视频解码错误",
        "视频资源未找到或资源不可用"
    ];

    var VIDEO_STATE_MESSAGE = [
        "当前网速较慢，建议先暂停等待缓冲再播放",
        "视频加载错误，点击重新加载<i></i>",
        "视频播放完毕，点击重新播放<i></i>"
    ];


    /**
     * 浏览器检测
     * @type {{mobile, android, ios, symbian, windowsPhone, blankBerry, weChat, qq, uc, chrome, firefox}}
     * Android 360 浏览器 userAgent 和 Chrome 一样, 猎豹,百度等等这些浏览器会在后面增加标识, 用这个特点区分
     */
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

    // Android Chrome, Firefox 以外都不支持 VR 视频
    if (browser.android && (!browser.chrome && !browser.firefox || browser.qq || browser.uc) || browser.ie || browser.ie11) {
        supportVR = false;
    }

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
        videoVR.fn.supportOrientation = supportOrientation;
        videoVR.fn.testedOrientation = true;

        if("function" === typeof videoVR.deviceorientation) {
            videoVR.deviceorientation(supportOrientation);
        }
    });


    // 格式化时间，转为为"h:m:s"格式
    function formatSecond(num) {
        num = typeof num == "number" ? num : parseFloat(num);

        var setDouble = function (num) {
            return num >= 10 ? num : "0" + num;
        };

        if (!isNaN(num)) {
            var strTime = "",
                hours, minutes, seconds;
            num = Math.ceil(num);
            if (num >= 3600) {
                hours = parseInt(num / 3600);
                minutes = parseInt(num % 3600 / 60);
                seconds = num % 60;
                strTime = hours + ":" + setDouble(minutes) + ":" + setDouble(seconds);
            } else if (num >= 60) {
                minutes = parseInt(num / 60);
                seconds = num % 60;
                strTime = setDouble(minutes) + ":" + setDouble(seconds);
            } else {
                strTime = "00:" + setDouble(num);
            }

            return strTime;
        } else {
            return "00:00";
        }
    }

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
    var fullscreen = (function () {
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

        fullscreenchangeEvents.some(function (item) {
            if ("on" + item in doc) {
                return fullscreenchange = item;
            }
        });

        fullscreenElementNames.some(function (item) {
            if (item in doc) {
                return fullscreenElement = item;
            }
        });

        var _changeEventsList = [];

        // 绑定全屏改变事件
        function on(callback) {
            if (fullscreenchange && "function" === typeof callback) {
                doc.addEventListener(fullscreenchange, callback, false);
                _changeEventsList.push(callback);
            }
        }

        // 清除全屏改变事件
        function off() {
            _changeEventsList.forEach(function (item) {
                doc.removeEventListener(fullscreenchange, item, false);
            })
        }

        // 全屏 document.documentElement
        function request() {
            if (fullscreenEnabled) {
                if ("function" === typeof requestFullscreen) {
                    requestFullscreen.call(h);
                }
            } else {
                console.info("unable fullscreen");
            }
        }

        // 退出全屏
        function exit() {
            if ("function" === typeof exitFullscreen) {
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

    // 页面可见性事件触发
    var documentVisibility = (function () {
        var hidden, visibilityState, visibilityChange;

        if (doc.hidden !== undefined) {
            hidden = "hidden";
            visibilityChange = "visibilitychange";
            visibilityState = "visibilityState";
        } else if (doc.webkitHidden !== undefined) {
            hidden = "webkitHidden";
            visibilityChange = "webkitvisibilitychange";
            visibilityState = "webkitVisibilityState";
        } else if (doc.mozHidden !== undefined) {
            hidden = "mozHidden";
            visibilityChange = "mozvisibilitychange";
            visibilityState = "mozVisibilityState";
        } else if (doc.msHidden !== undefined) {
            hidden = "msHidden";
            visibilityChange = "msvisibilitychange";
            visibilityState = "msVisibilityState";
        }

        var _eventList = [];

        function on(callback) {
            if ("function" === typeof callback) {
                doc.addEventListener(visibilityChange, callback, false);
                _eventList.push(callback);
            }
        }

        function off() {
            _eventList.forEach(function (item) {
                doc.removeEventListener(visibilityChange, item, false);
            })
        }

        return {
            on: on,
            off: off,
            hidden: hidden,
            visibilityState: visibilityState
        };
    }());

    /**
     * 旋转功能
     * @param elem
     * @returns {{start: Function, stop: Function}}
     */
    function rotateElem(elem) {
        if (elem && elem.nodeType === 1) {
            var deg = 0;
            var timeoutID;

            var transform = getCssPrefix("transform");

            var rotate = function () {
                deg += 6;
                if (deg >= 360) {
                    deg = 0;
                }
                elem.style[transform] = "rotate(" + deg + "deg)";
                timeoutID = setTimeout(rotate, 1000 / 60);
            };

            var start = function () {
                clearTimeout(timeoutID);
                rotate();
            };

            var stop = function () {
                clearTimeout(timeoutID);
            };

            return {
                start: start,
                stop: stop
            }
        }
    }

    var transition = getCssPrefix("transition"),
        transitionEnd = getTransitionEndEvent(),
        animationEnd = getAnimationEvent("AnimationEnd");

    function videoVR(ele, obj) {
        return new videoVR.fn.init(ele, obj);
    }

    videoVR.jQuery = $;
    videoVR.browser = browser;

    videoVR.fn = videoVR.prototype = {
        version: VERSION,
        constructor: videoVR,
        fullscreen: function () {
            var $main = this.$main;

            if ($main) {
                if ($main.hasClass(full_class_name)) {
                    fullscreen.exit();
                    $body.removeClass(lock_class_name);
                    $main.removeClass(full_class_name);
                } else {
                    fullscreen.request();
                    $body.addClass(lock_class_name);
                    $main.addClass(full_class_name);
                }
            }
            return this;
        },
        setSrc: function(src) {
            var $video = this.$video;

            if($video) {
                $video.attr("src", src);
                this.$main.removeClass(error_class_name + " " + playing_class_name).addClass(paused_class_name);
                this.$main[0].querySelector(".message").innerHTML = "";

                try {
                    $video[0].load();
                    $video[0].pause();
                    $video[0].currentTime = 0;
                    $video.trigger("timeupdate");
                } catch (e) {}
            }
        },
        destroy: function() {
            if("destroy" === this.status) {
                return;
            }

            cancelAnimationFrame(this.vrRequestID);

            this.$video.off();

            this.$video[0].src = "";

            var $main = this.$main;

            $main.off();

            $doc.off();

            $root.off();

            documentVisibility.off();

            fullscreen.exit();

            fullscreen.off();

            $main.find(".play, .pause, .vp-seek, .vp-play, .vp-timeline, .vp-ui, .vp-controls, .vr-fullscreen," +
                ".vp-stereo, .vp-orientation, .vp-exit-vr").off();

            var arrayClassName = ["video-player", full_class_name, mouseout_class_name, stalled_class_name,
                loading_class_name, playing_class_name, paused_class_name, ended_class_name, animation_class_name,
                error_class_name, load_class_name, ready_class_name];

            $main.empty().removeClass(arrayClassName.join(" "));

            $body.removeClass(lock_class_name);

            this.status = "destroy";
        },
        toast: (function () {
            var $elem = $("#vpToast"),
                duration = 4000,
                isVisible = 0,
                identity;

            if (undefined === $elem[0]) {
                $elem = $.createElem("div", "vp-toast").attr("id", "vpToast").hide();
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

    videoVR.fn.init = function (elem, conf) {
        if(!elem || elem.nodeType !== 1) {
            throw new Error("first argument must be Element");
        }

        if(!conf || "string" !== typeof conf.src) {
            throw new Error("second argument must be Object and attribute src must be String");
        }

        conf = "object" === typeof conf ? conf : {};

        var config = {
            /*ratio: 272 / 480,*/
            vr: true
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

        /**
         * start VR variable
         */
        var renderer, scene, camera, normalEffect, stereoEffect, stats;

        var mesh, sphere, material, texture;

        var orientationControls;

        /**
         * end VR variable
         */

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

        var isVR = config.vr;

        if (!supportVR || "object" !== typeof THREE) {
            isVR = false;
        }

        _vr.isVR = isVR;

        var $main = $(elem),
            $video = $.createElem("video", "vp-video"),             // video object
            $ratio = $.createElem("div", "vp-ratio"),               // 视频宽高比例

            $ui = $.createElem("div", "vp-ui"),                     // 视频UI
            $uiPlay = $.createElem("div", "play"),                  // 播放提示
            $uiPause = $.createElem("div", "pause"),                // 暂停提示
            $uiWaiting = $.createElem("div", "waiting"),            // 等待提示
            $uiMessage = $.createElem("div", "message"),            // 信息提示

            $controls = $.createElem("div", "vp-controls"),         // 控制台

            $timeline = $.createElem("div", "vp-timeline"),         // 视频时间线
            $buffer = $.createElem("div", "vp-buffer"),             // 已缓冲的区域
            $elapsed = $.createElem("div", "vp-elapsed"),           // 已播放的区域
            $seek = $.createElem("div", "vp-seek"),                 // 进度按钮
            $seekTime = $.createElem("div", "vp-seek-time"),        // 时间轴鼠标移动提示时间

            $handle = $.createElem("div", "vp-handle"),             // 操作功能
            $play = $.createElem("button", "vp-play"),              // 播放（暂停）按钮
            $time = $.createElem("div", "vp-time"),                 // 显示时间
            $currentTime = $.createElem("span", "vp-current"),      // 当前播放时间
            $duration = $.createElem("span", "vp-duration"),        // 视频总时间
            $fullscreen = $.createElem("button", "vr-fullscreen");  // 全屏按钮

        var $stereoEffect = $.createElem("button", "vp-stereo"),      // 进入VR视角按钮
            $exitVR = $.createElem("div", "vp-exit-vr"),              // 退出VR视角按钮
            $orientation = $.createElem("button", "vp-orientation");  // 陀螺仪视角控制按钮

        $video.attr({
            "preload": "none",
            "webkit-playsinline": "",
            "playsinline": "",
            "x-webkit-airplay": "allow"
        });

        if(config.autoplay) {
            $video.attr("autoplay", true);
        }


        $video.attr("src", config.src);

        if(config.ratio) {
            $ratio.css("padding-top", config.ratio * 100 + "%");
        }

        $main.addClass("video-player").append($ratio);

        // 视频封面设置
        if (typeof config.poster === "string" && (config.poster = $.trim(config.poster))) {
            $main.css("background-image", "url(" + config.poster + ")");
        }

        $uiWaiting.html("<i class=\"icon-loading vp-rotate\"></i>");
        $ui.append($uiPlay).append($uiPause).append($uiWaiting).append($uiMessage);
        $main.append($ui);

        $elapsed.append($seek);
        $timeline.append($buffer).append($elapsed).append($seekTime);

        $time.append($currentTime).append("/").append($duration);
        $controls.append($timeline).append($handle);
        $handle.append($play).append($time);
        $main.append($controls);

        /*main.on("contextmenu", function(event) {
         event.preventDefault();
         });*/

        var video = $video[0];

        if ("function" !== typeof video.canPlayType) {
            $main.addClass(error_class_name);
            $uiMessage.html("您的浏览器不支持html5 video！");

            return this;
        }

        _vr.$video = $video;
        _vr.$main = $main;

        $currentTime.text("00:00");
        $duration.text("00:00");

        if (isVR) {
            $video.attr("crossorigin", "anonymous");

            $handle.append($orientation).append($fullscreen).append($stereoEffect);

            $main.append($exitVR);
            $exitVR.text("退出VR视角");

            this.fov = DEFAULT_FOV;  // 视野（角度）
            this.isVRView = 0;       // 是否VR视角
            this.isOrientation = 0;  // 陀螺仪控制
        } else {
            $main.append($video);
            $handle.append($fullscreen);
        }

        if(config.src) {
            $video.attr("src", config.src);
        }

        // 是否开始播放
        var isStartPlaying = 0;

        var loadingRotateMethod;

        if (!supportAnimationEvent) {
            loadingRotateMethod = rotateElem($uiWaiting[0].childNodes[0]);
        }

        // 隐藏控制台定时器
        var mouseoutTimeout = (function () {
            var timeoutID;

            function clear() {
                clearTimeout(timeoutID);
                $main.removeClass(mouseout_class_name);
            }

            function set() {
                clearTimeout(timeoutID);
                timeoutID = setTimeout(function () {
                    if (!video.paused && _vr.status !== "destroy") {
                        $main.addClass(mouseout_class_name);
                    }
                }, controlDisplayTime);
            }

            return {
                clear: clear,
                set: set
            }
        }());


        // 隐藏提示快进时间的定时器
        var seekTimeTimeout = (function () {
            var timeoutID;

            function clear() {
                clearTimeout(timeoutID);
                $seekTime.show();
            }

            function set() {
                clearTimeout(timeoutID);
                timeoutID = setTimeout(function () {
                    $seekTime.hide();
                }, seekTimeDisplayTime);
            }

            return {
                clear: clear,
                set: set
            }
        }());

        // 视频第一次点击播放判断是否真正播放
        function startClickHandler() {
            video.play();
            $main.off("click", startClickHandler);
        }

        // 在下载被中断三秒以上时引发，这可以指示网络问题
        var stalledTimeoutID;

        function stalledHandler() {
            $main.addClass(stalled_class_name);
            $uiMessage.text(VIDEO_STATE_MESSAGE[0]);

            clearTimeout(stalledTimeoutID);

            stalledTimeoutID = setTimeout(function () {
                $uiMessage.text("");
                $main.removeClass(stalled_class_name);
            }, 5000);

            $video.off("stalled", stalledHandler);
        }

        // 是否拖拽结束，这里用来判断是否需要处理 timeupdate 的进度条，
        // 如果为1处理，如果为0不处理
        var dragSeekingEnd = 1;

        // 时间轴坐标信息
        var clientRect = $timeline[0].getBoundingClientRect();

        // 拖动快进
        var startX, startWidth, moveValue;

        // 进度按钮拖动处理函数
        var dragHandler = (function () {
            var count = 0;

            return function (event) {
                event.preventDefault();
                count++;

                if (0 === count % 2) {
                    mouseoutTimeout.clear();

                    var clientX = event.type === "touchmove" ? event.targetTouches[0].clientX : event.clientX;

                    var x = clientX - startX;
                    moveValue = x / clientRect.width * 100 + startWidth;

                    if (moveValue < 0) {
                        moveValue = 0;
                    } else if (moveValue > 100) {
                        moveValue = 100;
                    }

                    $elapsed.css("width", moveValue + "%");
                    var time = formatSecond(video.duration * moveValue / 100);
                    $currentTime.text(time);
                    $seekTime.text(time);

                    seekTimeTimeout.clear();
                    var width = $seekTime[0].offsetWidth,
                        left = clientRect.width * moveValue / 100 - width / 2;

                    if (left < 0) {
                        left = 0;
                    } else if (left > clientRect.width - width) {
                        left = clientRect.width - width;
                    }

                    $seekTime.css("left", left + "px");
                }
            };
        }());

        // 时间轴鼠标移动处理函数
        var moveHandler = (function () {
            var count = 0;

            return function (event) {
                event.preventDefault();
                if (dragSeekingEnd) {
                    count++;

                    if (0 === count % 2) {
                        var change = event.clientX - clientRect.left;
                        if (change < 0) {
                            change = 0;
                        } else if (change > clientRect.width) {
                            change = clientRect.width;
                        }

                        var value = change / clientRect.width;

                        $seekTime.text(formatSecond(video.duration * value));
                        $seekTime.show();

                        var width = $seekTime[0].offsetWidth,
                            left = event.clientX - clientRect.left - width / 2;

                        if (left < 0) {
                            left = 0;
                        } else if (left > clientRect.width - width) {
                            left = clientRect.width - width;
                        }

                        $seekTime.css("left", left + "px");
                    }
                }
            }
        }());

        // play & pause 动画结束事件监听
        var uiAnimationStatus = 0;

        $video.on("error", function () {  // 错误监视，当网络错误时提示重新加载,点击调用 load
            var _this = this,
                code = _this.error.code;

            $main.removeClass("is-loading is-playing is-paused is-stalled").addClass(error_class_name);

            // 提示重新加载
            if (code === 1 || code === 2) {
                $main.addClass(load_class_name);
                $uiMessage.html(VIDEO_STATE_MESSAGE[1]);

                // 点击重新加载
                $ui.one("click", function () {
                    _this.pause();
                    _this.load();
                    _this.play();
                    $uiMessage.html("");
                    $currentTime.text("00:00");
                    $buffer.css("width", "0%");
                    $elapsed.css("width", "0%");
                    $main.removeClass(error_class_name + " " + load_class_name);
                });
            } else {
                $uiMessage.html(VIDEO_ERRORS_MESSAGE[code]);
            }

        }).on("ended", function () {  // 播放结束
            var _this = this;
            _this.pause();

            $main.addClass(ended_class_name);
            $uiMessage.html(VIDEO_STATE_MESSAGE[2]);
            $ui.one("click", function () {
                _this.play();
            });

            $video.one("play", function () {
                $uiMessage.html("");
                $currentTime.text("00:00");
                $buffer.css("width", "0%");
                $elapsed.css("width", "0%");
                $main.removeClass(ended_class_name);
            });
        }).on("durationchange", function () {  // 资源长度发生改变
            var duration = this.duration;

            _vr.duration = duration;
            $duration.text(formatSecond(duration));
        }).on("loadedmetadata", function () {  // 获取资源长度
            var duration = this.duration;

            $duration.text(formatSecond(duration));
            _vr.duration = duration;
        }).on("loadeddata", function () {  // 在当前播放位置加载媒体数据时引发，视频可以开始播放
            this.controls = false;
            _vr.readyState = this.readyState;
        }).one("play", function () {
            $main.off("click", startClickHandler);

            if (!supportAnimationEvent) {
                $uiPlay.hide();
                $main.addClass(loading_class_name);
                loadingRotateMethod.start();
            } else {
                $main.addClass(animation_class_name + " " + loading_class_name);
            }

            // 由于Android bug 需要判断是否有 timeupdate 事件触发才可确认是否真正播放
            $video.one("timeupdate", function () {
                isStartPlaying = 1;

                $main.removeClass(loading_class_name).addClass(ready_class_name + " " + playing_class_name);
                if (!supportAnimationEvent) {
                    loadingRotateMethod.stop();
                }

                mouseoutTimeout.set();
            });
        }).on("waiting", function () {  // 在播放由于视频的下一帧不可用（可能需要缓冲）而停止时引发
            $main.addClass(loading_class_name);
            if (!supportAnimationEvent) {
                loadingRotateMethod.start();
            }
        }).on("progress", function () {  // 正在请求数据
            var timeRanges = this.buffered,
                length = timeRanges.length,
                current = video.currentTime,
                i = 0,
                start, end;

            if (length > 0) {
                for (i; i < length; i++) {
                    start = timeRanges.start(i);
                    end = timeRanges.end(i);
                    if (current >= start && current <= end) {
                        $buffer.css("width", timeRanges.end(i) / _vr.duration * 100 + "%");
                        break;
                    }
                }
            }
        }).on("timeupdate", function () {  // 当目前的播放位置已更改时

            // 开始播放并且拖拽快进完成
            if (isStartPlaying && dragSeekingEnd) {  // TODO chrome mobile 拖动后好几秒才会有时间的更改
                var time = this.currentTime;
                $currentTime.text(formatSecond(time));
                $elapsed.css("width", (time / video.duration * 100 || 0) + "%");
            }
        }).on("playing", function () {
            if (isStartPlaying) {
                $main.removeClass(loading_class_name).addClass(playing_class_name);
                $video.on("stalled", stalledHandler);
                if (!supportAnimationEvent) {
                    $uiPlay.hide();
                    loadingRotateMethod.stop();
                }
            }
        }).on("seeking", function () {
            $main.addClass(loading_class_name);
            if (!supportAnimationEvent) {
                loadingRotateMethod.start();
            }
        }).on("seeked", function () {
            $main.removeClass(loading_class_name);
            if (!supportAnimationEvent) {
                loadingRotateMethod.stop();
            }

            // IE播放中 seeked 不会触发 playing 事件，在这里处理兼容
            if (!this.paused) {
                $main.addClass(playing_class_name);
            }
        }).on("play", function () {
            $main.removeClass(paused_class_name);

            if (supportAnimationEvent) {
                uiAnimationStatus = 1;

                $uiPlay.show().addClass(zoom_out_class_name);
                $main.addClass(animation_class_name);

                $uiPause.hide();
            }
        }).on("pause", function () {
            if (isStartPlaying) {
                $main.addClass(paused_class_name).removeClass(playing_class_name);

                if (!this.ended) {
                    if (supportAnimationEvent) {
                        uiAnimationStatus = 2;

                        $uiPause.show().addClass(zoom_out_class_name);
                        $main.addClass(animation_class_name);

                        $uiPlay.hide();
                    } else {
                        $uiPlay.show();
                    }
                }
            } else {
                $main.removeClass(animation_class_name + " " + loading_class_name);
                $uiPlay.show().removeClass(zoom_out_class_name);

                $video.one("play", function () {
                    if (!supportAnimationEvent) {
                        $uiPlay.hide();
                        $main.addClass(loading_class_name);
                        loadingRotateMethod.start();
                    } else {
                        $main.addClass(animation_class_name + " " + loading_class_name);
                    }
                });

                $main.on("click", startClickHandler);
            }
        });

        $main.on("click", startClickHandler);

        $play.on("click", function () {
            if (!video.error) {
                video.paused ? video.play() : video.pause();
            }
        });

        $uiPlay.on(animationEnd, function () {
            if (1 === uiAnimationStatus) {
                $uiPlay.hide().removeClass(zoom_out_class_name);
                $main.removeClass(animation_class_name);

                // 用于视频刚开始点击播放就暂停时的逻辑
                if (!isStartPlaying && video.paused) {
                    $uiPlay.show();
                }

                uiAnimationStatus = 0;
            }
        });

        $uiPause.on(animationEnd, function () {
            if (2 === uiAnimationStatus) {
                $uiPause.hide().removeClass(zoom_out_class_name);
                $main.removeClass(animation_class_name);

                uiAnimationStatus = 0;
            }
        });

        // seek按钮鼠标按下添加拖拽事件，鼠标松开移除拖拽事件
        $seek.on("mousedown", function (event) {  // TODO 鼠标右键点击 bug
            dragSeekingEnd = 0;
            startX = event.clientX;
            moveValue = undefined;
            var width = $elapsed[0].style.getPropertyValue("width");
            startWidth = width ? parseFloat(width) : 0;
            clientRect = $timeline[0].getBoundingClientRect();

            $doc.on("mousemove", dragHandler).one("mouseup", function () {
                dragSeekingEnd = 1;
                if (moveValue !== undefined) {
                    video.currentTime = video.duration * moveValue / 100;
                }

                mouseoutTimeout.set();
                seekTimeTimeout.set();

                $doc.off("mousemove", dragHandler);
            });
        }).on("touchstart", function (event) {  // seek添加touch拖动事件
            dragSeekingEnd = 0;
            startX = event.targetTouches[0].clientX;
            var width = $elapsed[0].style.getPropertyValue("width");
            startWidth = width ? parseFloat(width) : 0;
            clientRect = $timeline[0].getBoundingClientRect();

            $doc.on("touchmove", dragHandler).one("touchend", function () {
                dragSeekingEnd = 1;
                video.currentTime = video.duration * moveValue / 100;

                mouseoutTimeout.set();
                seekTimeTimeout.set();

                $doc.off("touchmove", dragHandler);
            });
        });

        // 时间抽点击快进
        $timeline.on("click", function (event) {
            var clientRect = this.getBoundingClientRect(),
                value = (event.clientX - clientRect.left) / this.offsetWidth;

            $elapsed.css("width", value * 100 + "%");
            var curt = video.duration * value,
                time = formatSecond(curt);

            $currentTime.text(time);
            $seekTime.text(time);
            video.currentTime = curt;

            seekTimeTimeout.clear();

            var width = $seekTime[0].offsetWidth,
                left = event.clientX - clientRect.left - width / 2;

            if (left < 0) {
                left = 0;
            } else if (left > clientRect.width - width) {
                left = clientRect.width - width;
            }

            $seekTime.css("left", left + "px");

            seekTimeTimeout.set();
        });

        if (!supportTouch) {
            $timeline.on("mouseover", function () {
                clientRect = this.getBoundingClientRect();
            }).on("mouseout", function () {
                if (dragSeekingEnd) {
                    $seekTime.hide();
                }
            });

            $timeline.on("mousemove", moveHandler);
        }

        // 页面不可见,暂停播放
        documentVisibility.on(function () {
            if (doc[documentVisibility.hidden]) {
                video.pause();
                $main.removeClass(mouseout_class_name);
            }
        });

        if (!supportTouch) {
            $main.on("mousemove", function () {
                mouseoutTimeout.clear();
                mouseoutTimeout.set();
            });
        }

        // 点击切换播放状态
        if (supportTouch) {
            $ui.on("click", function () {
                if (!video.error && !vr_isMove) {
                    if (video.paused) {
                        $main.removeClass(mouseout_class_name);
                        video.play();
                    } else {
                        if (!$main.hasClass(mouseout_class_name)) {
                            video.pause();
                        } else {
                            $main.removeClass(mouseout_class_name);
                        }
                    }
                    if (isStartPlaying) {
                        mouseoutTimeout.set();
                    }
                }
            });

            $controls.on("touchstart", function () {
                mouseoutTimeout.clear();
                mouseoutTimeout.set();
            });
        } else {
            $ui.on("click", function () {
                if (!video.error && !vr_isMove) {
                    video.paused ? video.play() : video.pause();
                }
            });
        }

        // 全屏按钮
        $fullscreen.on("click", function () {
            if ($main.hasClass(full_class_name)) {
                fullscreen.exit();
                $body.removeClass(lock_class_name);
                $main.removeClass(full_class_name);
                $fullscreen.removeClass(active_class_name);
            } else {
                fullscreen.request();
                $body.addClass(lock_class_name);
                $main.addClass(full_class_name);
                $fullscreen.addClass(active_class_name);
            }

            if(isVR) {
                vrResize();
            }
        });

        // 全屏事件改变触发
        fullscreen.on(function () {  // TODO chrome 仿移动浏览器退出全屏未触发事件
            if (doc[fullscreen.fullscreenElement] !== doc.documentElement) {
                $body.removeClass(lock_class_name);
                $main.removeClass(full_class_name);
                $fullscreen.removeClass(active_class_name);
            }

            if(isVR) {
                vrResize();
            }
        });


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

            $body.addClass(lock_class_name);
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
            $orientation.removeClass(active_class_name);

            fullscreen.exit();

            $body.removeClass(lock_class_name);
            $main.removeClass("is-vr");

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
                _vr.toast(VR_STATE_MESSAGES[1]);
            }

            return _vr;
        }

        if(isVR) {
            renderer = normalEffect = new THREE.WebGLRenderer();

            stereoEffect = new THREE.StereoEffect(renderer);

            camera = new THREE.PerspectiveCamera(_vr.fov, elem.clientWidth / elem.clientHeight, 1, 1000);

            orientationControls = new THREE.DeviceOrientationControls(camera);

            scene = new THREE.Scene();

            texture = new THREE.Texture(video);
            texture.generateMipmaps = false;
            texture.minFilter = THREE.LinearFilter;
            texture.format = THREE.RGBAFormat;

            material = new THREE.MeshBasicMaterial({
                map: texture
            });

            sphere = new THREE.SphereBufferGeometry(RADIUS, 60, 60);
            sphere.scale(-1, 1, 1);

            mesh = new THREE.Mesh(sphere, material);

            scene.add(mesh);

            // 条纹展示
            /*var edges = new THREE.EdgesHelper(mesh, 0x666666);
             scene.add(edges);*/

            // TODO 性能监测
            /*stats = new Stats();
             $body.append(stats.dom);*/

            renderer.setSize(elem.clientWidth, elem.clientHeight);
            renderer.setClearColor(0x666666);
            renderer.setPixelRatio(window.devicePixelRatio || 1);
            _vr.canvas = renderer.domElement;
            $(_vr.canvas).addClass("vp-video");
            $main.append(_vr.canvas);

            renderer.render(scene, camera);

            $root.on("resize", vrResize);

            $ui.on("mousedown", vrMouseDown).on("touchstart", vrTouchStart).on("mousemove", vrMouseMove).on("touchmove", vrTouchMove);

            $ui.on("mouseup mouseout touchcancel", vrMouseUp).on("touchend", vrTouchEnd);

            $stereoEffect.on("click", requestStereo);
            $orientation.on("click", changeOrientation);
            $exitVR.on("click", exitStereo);
            $main.on("mousewheel MozMousePixelScroll", vrMouseWheel);

            var vrUpload = function () {
                vr_lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, vr_lat));

                var x = RADIUS * Math.cos(vr_lon) * Math.cos(vr_lat);

                var y = RADIUS * Math.sin(vr_lat);

                var z = RADIUS * Math.sin(vr_lon) * Math.cos(vr_lat);

                var target = new THREE.Vector3(x, y, z);

                if (video.readyState >= video.HAVE_CURRENT_DATA) {
                    texture.needsUpdate = true;
                }

                if (_vr.isOrientation) {
                    orientationControls.update();
                } else {
                    camera.lookAt(target);
                }

                // TODO 性能监测
                //stats.update();

                renderer.render(scene, camera);

                _vr.vrRequestID = requestAnimationFrame(vrUpload);
            };

            $video.one("play", vrUpload);

            // vrUpload();

            _vr.resize = vrResize;
            _vr.requestStereo = requestStereo;
            _vr.exitStereo = exitStereo;
            _vr.changeOrientation = changeOrientation;
        }
    };

    videoVR.prototype.init.prototype = videoVR.prototype;

    if ("function" === typeof define && define.amd) {
        define(["three", "three-extend"], function () {
            return videoVR;
        });
    } else if ("object" === typeof exports) {
        module.exports = videoVR;
    } else {
        window.videoVR = videoVR;
    }
}(function () {
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