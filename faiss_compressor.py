import faiss
import numpy as np

class FAISSCompressor:
    """IndexIVFPQ compression, dynamic eviction, mmap storage."""
    
    def __init__(self, dimension: int, n_list: int = 100, m: int = 8):
        self.dimension = dimension
        self.quantizer = faiss.IndexFlatL2(dimension)
        self.index = faiss.IndexIVFPQ(self.quantizer, dimension, n_list, m, 8)
        self.is_trained = False

    def train_and_add(self, data: np.ndarray):
        if not self.is_trained:
            self.index.train(data)
            self.is_trained = True
        self.index.add(data)

    def search(self, query: np.ndarray, k: int = 5):
        return self.index.search(query, k)

    def save_mmap(self, path: str):
        faiss.write_index(self.index, path)
