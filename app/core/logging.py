import logging

def init_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    # Keep uvicorn logs consistent with our level
    logging.getLogger("uvicorn.error").setLevel(level.upper())
    logging.getLogger("uvicorn.access").setLevel(level.upper())
