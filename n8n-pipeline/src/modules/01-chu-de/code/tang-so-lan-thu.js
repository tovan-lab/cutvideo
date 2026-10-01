const data = $input.first().json;
return [{ json: { ...data, attempt: data.attempt + 1 } }];