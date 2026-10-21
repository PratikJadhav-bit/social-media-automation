import argparse,json,sys
p=argparse.ArgumentParser();p.add_argument('stage',choices=['trends','embeddings']);p.add_argument('--query',default='consumer rights');a=p.parse_args()
if a.stage=='trends':
    from pytrends.request import TrendReq
    trends=TrendReq(hl='en-IN',tz=330,timeout=(10,25));trends.build_payload([a.query],geo='IN')
    related=trends.related_queries();result=[]
    for frames in related.values():
        for frame in frames.values():
            if frame is not None: result+=frame['query'].tolist()
    print(json.dumps(result[:20]))
else:
    from sentence_transformers import SentenceTransformer
    texts=json.load(sys.stdin)
    model=SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')
    print(json.dumps(model.encode(texts,normalize_embeddings=True).tolist()))
