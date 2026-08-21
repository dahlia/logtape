 -  Fixed a `TypeError: Converting circular structure to JSON` raised while
    rendering interpolated message values (e.g., logging a `Response` or any
    value containing circular reference).  [[#202] by Sefa Eyeoglu]
