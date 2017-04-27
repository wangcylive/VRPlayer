/**
 * Created by wangchunyang on 16/5/15.
 */
var gulp = require("gulp"),
    del = require("del"),
    uglify = require("gulp-uglify"),
    cssnano = require("gulp-cssnano"),
    concat = require("gulp-concat"),
    rev = require("gulp-rev"),
    sourcemaps = require("gulp-sourcemaps"),
    filter = require("gulp-filter"),
    useref = require("gulp-useref"),
    revReplace = require("gulp-rev-replace"),
    replace = require("gulp-replace"),
    gulpif = require("gulp-if"),
    rename = require("gulp-rename");

gulp.task("default", function() {
    gulp.src([
        "./src/js/three-extend.js",
        "./src/js/vr-image.js",
        "./src/js/vr-video.js",
        "./src/css/vr-image.css",
        "./src/css/vr-video.css"
    ],{base: "./src"})
        .pipe(gulpif("*.js", uglify()))
        .pipe(gulpif("*.css", cssnano()))
        .pipe(rename(function(path) {
            path.basename += ".min"
        }))
        .pipe(gulp.dest("./src"));
});