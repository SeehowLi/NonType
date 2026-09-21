// Desktop builds never open a console, including locally tested debug builds.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

fn main() {
    opentypeless_lib::run()
}
