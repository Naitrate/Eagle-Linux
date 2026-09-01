EagleApp.directive('welcomePage', ($timeout, $rootScope, $filter) => ({
    restrict: 'E',
    templateUrl: 'js/directives/welcome-page.html',
    scope: {
        theme: '=theme'
    },
    link: function ($scope, element, attrs, controllersArr) {

        const ipcRenderer = electron.ipcRenderer;
        $scope.platform = process.platform === 'linux' ? 'win32' : process.platform;
        $scope.isOpen = false;
        $scope.welcomeStep = 0;
        $scope.currentTheme = $scope?.theme?.toUpperCase() || 'DARK';
        $scope.totalSteps = [1, 2, 3, 4];
        $scope.$body = angular.element(document.body).scope();

        $scope.selectTheme = (theme) => {
            $scope.currentTheme = theme;
            $("#welcome-page").addClass("theme-changing");
            setTimeout(() => {
                $("#welcome-page").removeClass("theme-changing");
            }, 500);
            ipcRenderer.send('change-theme', {
                name: theme,
                css: theme.toLowerCase(),
            });
        };

        $scope.gotoStep = (step) => {
            $scope.welcomeStep = step;
        };

        $scope.next = () => {
            $scope.welcomeStep++;
            if ($scope.welcomeStep > $scope.totalSteps.length) {
                $scope.welcomeStep = $scope.totalSteps.length;
            }
        };

        $scope.prev = () => {
            $scope.welcomeStep--;
            if ($scope.welcomeStep < 1) {
                $scope.welcomeStep = 1;
            }
        }; 

        ipcRenderer.on('app-status-welcome', (e, params) => {
            
            currentWindow.setMinimumSize(1024, 768);

            $scope.isOpen = true;
            $("body").addClass("is-welcome-page");    

            // 资源库路径遗失，显示提示
            if (params && params.libraryMissed) {
                var libraryPath = params.libraryPath;
                $scope.welcomeStep = 5;
                $scope.libraryPath = libraryPath;
                $scope.isLibraryMissed = true;
                $scope.libraryName = path.basename(libraryPath);
            }
            else {
                $timeout(() => {
                    $scope.welcomeStep = 1;
                }, 500);
            }
            
            $scope.$evalAsync();
        });

        ipcRenderer.on('app-status-library-dirs-loaded', (e, count) => {
            $("body").removeClass("is-welcome-page");
            currentWindow.setMinimumSize(500, 375);
            $scope.isOpen = false;
            $scope.$evalAsync();
        });

        ipcRenderer.on('app-status-library-cache-loaded', (e) => {
            $("body").removeClass("is-welcome-page");
            currentWindow.setMinimumSize(500, 375);
            $scope.isOpen = false;
            $scope.$evalAsync();
        });
    }
}));