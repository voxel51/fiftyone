import shutil
import sys
from pathlib import Path

import sass


def process_css():
    current_dir = Path(__file__).parent

    source_dir = current_dir / "source/assets/styles"
    output_dir = current_dir / "source/_static/css"

    try:
        sass.compile(dirname=(str(source_dir), str(output_dir)), output_style="compressed")

        main_css = output_dir / "main.css"
        custom_css = output_dir / "custom.css"

        if main_css.exists():
            shutil.move(str(main_css), str(custom_css))

        print(f"Successfully compiled SASS files to {custom_css}")
    except sass.CompileError as e:
        print(f"SASS compilation error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    process_css()