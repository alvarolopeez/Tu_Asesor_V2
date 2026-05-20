import json

with open(r'C:\Users\alvar\.gemini\antigravity\brain\0efb388d-c485-4272-9900-c70307d0dff0\.system_generated\logs\overview.txt', 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        try:
            d = json.loads(line)
            step = d.get('step_index')
            if step is not None and 1300 <= step <= 1800:
                # check if there's any image/media/png reference
                content_str = json.dumps(d)
                if 'media' in content_str or 'png' in content_str or 'webp' in content_str or 'jpg' in content_str or 'gif' in content_str:
                    print(f"=== STEP {step} ({d.get('source')}, {d.get('type')}) ===")
                    # print keys or some summary
                    for k, v in d.items():
                        if k != 'content':
                            print(f"  {k}: {v}")
                        else:
                            print(f"  content length: {len(v)}")
                            # print any lines matching png/webp
                            for cl in v.split('\n'):
                                if any(x in cl for x in ['media', 'png', 'webp', 'jpg']):
                                    print(f"    {cl[:150]}")
                    print("-" * 50)
        except Exception as e:
            pass
