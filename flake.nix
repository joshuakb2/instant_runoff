{
  description = "instant_runoff";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" ];

      forEachSystem =
        f:
        builtins.listToAttrs (
          map (system: {
            name = system;
            value = f system;
          }) systems
        );

      pkgs = forEachSystem (
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        }
      );

      mkDevShell =
        system: with pkgs.${system}; {
          default = mkShell {
            name = "instant_runoff";
            buildInputs = [
              nodejs_24
              google-chrome
            ];
            env.PUPPETEER_EXECUTABLE_PATH = lib.getExe google-chrome;
          };
        };
    in
    {
      devShells = forEachSystem mkDevShell;
    };
}
