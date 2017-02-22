/**
 * Created by alexey.matveev on 22.02.2017.
 */
const
    fs = require('fs'),
    async = require('async'),
    //bunyan = require('bunyan'),
    crypto = require('crypto'),
    path = require('path'),
    mkdirp = require('mkdirp');

class CheckFiles
{
    constructor(dir=this.checkDirName)
    {
        //имя директории для проверки и анализа контрольных сумм
        this.checkDirName = path.resolve('./appsrv');
        if(dir)
        {
            this.checkDirName = path.resolve(dir);
        }
        //имя директории, в которую будет проводиться вывод
        //this.outputDirName = path.resolve(`${this.checkDirName}/checksum/`);
        this.outputDirName = path.resolve('./checksum/');
        //имя файла с информацией о новых,измененных, удаленных файлах
        this.shortLogFileName = path.resolve(`${this.outputDirName}/history_log.json`);
        //имя файла с полной информацией(путь, контрольная сумма, дата изменения, размер) о всех файлах в директории
        this.fullLogFileName = path.resolve(`${this.outputDirName}/full_log.json`);
        //только один крайний снимок
        this.lastSnap = path.resolve(`${this.outputDirName}/short_log.json`);
        this.qHashFile = async.queue((args, callback) => {
            //объект для расчета контрольной суммы:
            const oHash = crypto.createHash('md5');
            //создать поток для чтения файла
            let rs = fs.createReadStream(args.filePath);
            rs.on('error', args.callback);
            rs.on('data', (data) => {
                oHash.update(data);
            });
            rs.on('end', () => {
                args.callback(null, oHash.digest('base64').replace(/=/g, ''));
                callback();
            });
        },16); //Максимальное количество одновременно расчитываемых контрольных сумм для файлов
    }

    /**
     * ############  низкоуровневые методы(ввод-вывод)  #############
     */

    /**
     * асинхронная очередь расчета контрольной суммы файлов
     */

    /**
     * Получение атрибутов директории
     * @dirPath
     * @callback
     */
    getAttrDir(dirPath,callback) {
        fs.readdir(dirPath,(err,items)=>{
            if(err) return callback(err);
            //определяем атрибуты дочерних элементов
            let result = {
                size:0,
                type:'directory',
                filesCount:items.length,
                items:{},
            };
            let hashes = [];//массив из контрольных сумм дочерних элементов
            //для каждого файла из директории асинхронно выполняем указанную функцию
            //const fullItemPath = path.join(dirPath,itemName)
            async.each(items,(itemName,callback)=>{
                this.getAttrItem(path.join(dirPath,itemName),(err,attr)=>{
                    if(err) return callback(err);
                    //Считаем размер и записываем в результат
                    result.size+= attr.size;
                    //сохраняем объект
                    result.items[path.join(dirPath,itemName)] = attr;
                    //сохраняем хеш в массив хешей
                    hashes.push(attr.hash);
                    //идем дальше...
                    callback();
                });
            },(err)=>{
                if(err) return callback(err);
                hashes.sort();//упорядочивание контрольных сумм...
                let oHash = crypto.createHash('md5');
                hashes.forEach((hash)=>{
                    oHash.update(hash);
                });
                //хеш директории:
                result.hash = oHash.digest('base64').replace(/=/g,'');
                callback(null,result);
            })
        });
    }
    /**
     * Получение атрибутов файла
     * @param itemPath
     * @param callback
     */
    getAttrItem(itemPath,callback) {

        fs.stat(itemPath,(err,stat)=>{
            if(err) return callback(err);
            if(stat.isDirectory())
            {
                this.getAttrDir(itemPath,callback);
            }
            else
            {
                //console.log(itemPath);
                //добавить файл в очередь расчета контрольной суммы
                this.qHashFile.push({
                    filePath:itemPath,
                    callback:(err,hash)=>{
                        callback(err,{
                            size:stat.size,//размер
                            type:'file',
                            hash:hash,//контрольная сумма файла
                            mtime:stat.mtime.toISOString() //дата последнего изменения файла
                        });
                    }
                },(err)=>{
                    if(err) return callback(err);
                });
            }
        });
    }

    /**
     *  ############  среднеуровневые методы(объекты) #############
     */

    /**
     * Извлечь все файлы(игнорируя директории, убирая вложенность)
     * @param _object_=начальный_объект_в_формате_JSON
     * @param _callback_=function(err,result), где result-результирующий объект
     */
    extractFromJSON(_object_,_callback_)
    {
        let filesArray=[];
        const extractFiles = (_object,path,_callback)=>{
            //for()
            if((_object.type=='directory')&&(_object.items))
            {
                //идем вглубь
                for(let key in _object.items)
                {
                    extractFiles(_object.items[key],key,(err)=>{if(err) return _callback(err)});
                }
            }
            else if(_object.type=='file')
            {
                _object.path=path;
                filesArray.push(_object);
            }
            else {
                _callback(new Error("Error!!!"));
            }
            _callback(null,filesArray);
        };
        return extractFiles(_object_,null,_callback_);
    };

    /**
     * Основная функция рассчета и создания файлов
     * @param callback=function(err,result=объект_со_списком_изменений)
     */
    runMain(callback)
    {
        this.getAttrDir(this.checkDirName, (err, result) => {
            const dir = this.outputDirName;
            if (err) throw err;
            //проверка на существование файла с данными.
            mkdirp(dir, (err) => {
                const today = new Date().toISOString();
                fs.stat(this.fullLogFileName, (err, stats) => {
                    if (err) {
                        //случай, когда файла нет на диске: пишем в него текущий снимок
                        if (err.code = 'ENOENT') {
                            //выделяем из объекта все файлы
                            this.extractFromJSON(result,(err,result_extract)=>{
                                if(err) throw err;
                                //сохраняем их в файл
                                fs.writeFile(this.fullLogFileName, JSON.stringify(result_extract), (err) => {
                                    if (err) {
                                        throw err;
                                    }
                                    const json_obj={date:today,changes:'This is the first time you run checking program, so there is nothing to compare...'};
                                    fs.writeFile(this.shortLogFileName,JSON.stringify(json_obj),(err)=>{
                                        if(err) throw err;
                                        fs.writeFile(this.lastSnap,JSON.stringify(json_obj),(err,ress)=>{
                                            if(err) throw err;
                                            callback(null,null);
                                        });
                                    });
                                    //FILE WAS SAVED
                                    //сохраняем файл и выходим, ничего не сравнивая
                                });
                            });
                        }
                    }
                    else {
                        //файл out.json есть
                        //сравниваем содержимое файла и того, что мы только что считали.
                        async.parallel([
                                (cb) => {
                                    //вынимаем все объекты типа 'файл' из файла, который есть на диске
                                    //# прошлый снимок
                                    fs.readFile(this.fullLogFileName, (err, result1) => {
                                        const my_object = JSON.parse(result1);
                                        //преобразовываем его в нужный нам объект:
                                        //this.extractFromJSON(my_object, cb);
                                        cb(null,my_object);
                                        //console.log(`result of opening file: ${result1}`);
                                    });
                                },
                                (cb) => {
                                    //вынимаем все объекты типа 'файл' из текущего анализа
                                    //# текущий снимок
                                    this.extractFromJSON(result, cb);
                                }
                            ],
                            (err, results) => {
                                const resObject = {
                                    new_files: [],
                                    modified_files: [],
                                    deleted_files: []
                                };
                                //сравниваем результирующие массивы:
                                results[0].forEach((item, index, arr) => {
                                    const found = results[1].find((element) => {
                                        if (element.path === item.path) {
                                            return true;
                                        }
                                    });
                                    if (found) {
                                        //нашли элемент в текущем снимке, сравниваем 2 снимка
                                        //let str = `file ${item.path} modyfied by:`;
                                        if (item.hash === found.hash) {
                                            //файл не был изменен.
                                        }
                                        else {
                                            if (!(item.mtime === found.mtime)) {
                                                //файл был изменен - помещаем в объект для оповещения пользователя об этом
                                                resObject.modified_files.push(found.path);
                                            }
                                        }
                                    }
                                    else {
                                        //в прошлом снимке есть, в текущем - не найдено => файл был удален
                                        resObject.deleted_files.push(item.path);
                                    }
                                });
                                results[1].forEach((item, index, arr) => {
                                    //теперь ищем измененные файлы, делая для каждого элемента нового снимка поиск в старом
                                    //если не найдено => файл новый
                                    const found = results[0].find((element) => {
                                        if (element.path === item.path) {
                                            return true;
                                        }
                                    });
                                    if (!found) {
                                        //заносим новый файл в список
                                        resObject.new_files.push(item.path);
                                    }

                                });

                                //сохраняем файл с изменениями и out.json
                                //вынимаем старый json и дополняем его:
                                //const obj = {date:today,changes:resObject};
                                const shortLog = require(this.shortLogFileName);
                                //Object.assign(shortLog,obj);
                                shortLog[today]=resObject;
                                fs.writeFile(this.shortLogFileName, JSON.stringify(shortLog), (err, res) => {
                                    if (err) throw err;
                                    //сохраняем новый снимок, перезаписывая старый
                                    fs.writeFile(this.fullLogFileName, JSON.stringify(results[1]), (err, res) => {
                                        if (err) throw err;
                                        const obj = {date:today,changes:resObject};
                                        fs.writeFile(this.lastSnap,JSON.stringify(obj),(err,ress)=>{
                                            if(err) throw err;
                                            callback(null,resObject);
                                        });
                                    });
                                });
                            });
                    }

                });
            });


        });
    };
}

exports.fileLogger = function(directoryPath,callback){
    const files = new CheckFiles(path.resolve(directoryPath));
    files.runMain(callback);
};
