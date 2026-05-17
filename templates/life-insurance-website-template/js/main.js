

(function ($) {
    "use strict";

    // Spinner
    var spinner = function () {
        setTimeout(function () {
            if ($('#spinner').length > 0) {
                $('#spinner').removeClass('show');
            }
        }, 1);
    };
    spinner(0);

    // Inizializza WOW.js
    new WOW().init();

    // Header carousel (UNA sola slide: no autoplay, no nav, no dots, no loop)
    $(".header-carousel").owlCarousel({
        items: 1,
        margin: 0,
        stagePadding: 0,
        autoplay: false,
        loop: false,
        nav : false,
        dots: false,
        mouseDrag: false,
        touchDrag: false,
        pullDrag: false,
        freeDrag: false,
    });

    // Testimonial carousel
    $(".testimonial-carousel").owlCarousel({
        autoplay: true,
        smartSpeed: 1500,
        center: false,
        dots: false,
        loop: false,
        margin: 25,
        nav : true,
        navText : [
            '<i class="fa fa-arrow-right"></i>',
            '<i class="fa fa-arrow-left"></i>'
        ],
        responsiveClass: true,
        responsive: {
            0:{ items:1 },
            576:{ items:1 },
            768:{ items:2 },
            992:{ items:2 },
            1200:{ items:2 }
        }
    });

    // Facts counter
    $('[data-toggle="counter-up"]').counterUp({
        delay: 5,
        time: 2000
    });

    // --- Sticky Navbar rimosso ---

})(jQuery);
